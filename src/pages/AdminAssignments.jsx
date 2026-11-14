import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HardDrive, Inbox, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { listManagedCourses, listModules } from '../services/lms.js';
import { assignmentError, deleteAssignment, listAssignmentsAdmin, saveAssignment, storageUsage } from '../services/assignments.js';
import { PLAN_STORAGE_BYTES, SUBMISSION_KINDS, dueLabel, formatBytes, toLocalInput } from '../lib/submissionRules.js';
import { AdminHeading, Empty, Notice, Status, panel } from '../components/AdminUI.jsx';

const weekFromNow = () => { const d = new Date(Date.now() + 7 * 86400000); d.setHours(23, 59, 0, 0); return toLocalInput(d.toISOString()); };
const blank = () => ({ id: null, title: '', module_id: '', instructions: '', due_at: weekFromNow(), allow_late: true, max_points: 100, submission_types: ['link', 'file'], published: false });

/** Instructor assignments: deadlines, hand-in types, submission counts and storage use. */
export default function AdminAssignments() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [modules, setModules] = useState([]);
  const [data, setData] = useState(null);
  const [usage, setUsage] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); });
  }, []);
  const load = useCallback(async () => {
    if (!course) return;
    setData(null); setUsage(null);
    try {
      const [list, mods, use] = await Promise.all([
        listAssignmentsAdmin(course),
        listModules(course),
        storageUsage(course),
      ]);
      setData(list); setModules(mods); setUsage(use);
    } catch (e) { setError(e.message); }
  }, [course]);
  useEffect(() => { load(); setForm(null); }, [load]);

  async function save(e) {
    e.preventDefault();
    const problem = assignmentError(form);
    setFormError(problem);
    if (problem) return;
    setBusy(true); setError(''); setInfo('');
    try { await saveAssignment(course, form); setInfo(form.id ? 'Assignment updated.' : 'Assignment created.'); setForm(null); await load(); }
    catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  }
  async function remove(a) {
    if (!window.confirm(`Delete "${a.title}" and all ${a.handedIn} submission(s)? This cannot be undone.`)) return;
    setBusy(true); setError(''); setInfo('');
    try { await deleteAssignment(a.id); setInfo('Assignment deleted.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Assignments" description="Set work with a deadline. Students hand in a link, a file or a written answer; you see who is on time, late or missing, and grade it." />
      <Notice error={error} info={info} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course first." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 flex flex-wrap gap-4 items-end`}>
            <label className="flex-1 min-w-56 font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => setCourse(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <button className="primary" disabled={busy} onClick={() => { setForm(blank()); setFormError(''); }}><Plus size={16} aria-hidden="true" /> New assignment</button>
          </div>

          {usage && <StorageUsage usage={usage} />}
          {form && <AssignmentForm form={form} setForm={setForm} modules={modules} error={formError} busy={busy} onSubmit={save} />}

          {!data ? <p className="muted" role="status">Loading assignments...</p> : data.assignments.length === 0 ? (
            <Empty text="No assignments in this course yet." />
          ) : (
            <ul className="space-y-3">
              {data.assignments.map((a) => (
                <li key={a.id} className={`${panel} p-5 flex flex-wrap items-center justify-between gap-4`}>
                  <div className="min-w-0">
                    <p className="font-bold text-text">{a.title}</p>
                    <p className="text-sm text-text-muted mt-1">
                      Due {new Date(a.due_at).toLocaleString()} · {dueLabel(a.due_at)}{a.module_id ? ` · ${modules.find((m) => m.id === a.module_id)?.title || 'module'}` : ''}
                    </p>
                    <p className="text-sm mt-1 text-text">
                      {a.handedIn} of {data.enrolled} handed in
                      {a.late > 0 && <span className="text-warning font-semibold"> · {a.late} late</span>}
                      {a.toGrade > 0 && <span className="text-brand font-semibold"> · {a.toGrade} to grade</span>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Status value={a.published} />
                    <Link className="primary text-sm" to={`/admin/assignments/${a.id}`}><Inbox size={14} aria-hidden="true" /> Submissions</Link>
                    <button className="secondary text-sm" disabled={busy} onClick={() => { setForm({ ...a, module_id: a.module_id || '', due_at: toLocalInput(a.due_at) }); setFormError(''); }}><Pencil size={14} aria-hidden="true" /> Edit</button>
                    <button className="secondary !text-danger" disabled={busy} aria-label={`Delete ${a.title}`} onClick={() => remove(a)}><Trash2 size={14} aria-hidden="true" /></button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function StorageUsage({ usage }) {
  const project = Number(usage.project_bytes);
  const pct = Math.min(100, Math.round((project / PLAN_STORAGE_BYTES) * 100));
  const tone = pct >= 90 ? 'bg-danger' : pct >= 75 ? 'bg-warning' : 'bg-brand';
  return (
    <section className={`${panel} p-5`} aria-labelledby="storage-heading">
      <h2 id="storage-heading" className="font-black text-text flex items-center gap-2"><HardDrive size={18} className="text-brand" aria-hidden="true" /> Storage</h2>
      <p className="text-sm text-text mt-2">This course: <strong>{formatBytes(Number(usage.course_bytes))}</strong> (files you uploaded and files students handed in)</p>
      <p className="text-sm text-text mt-1">Whole project: <strong>{formatBytes(project)}</strong> of {formatBytes(PLAN_STORAGE_BYTES)} on the free plan ({pct}%)</p>
      <div className="mt-2 h-2.5 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-label="Project storage used" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {pct >= 75 && <p className="text-sm text-warning mt-2">Storage is filling up. Ask students to hand in videos as links instead of files.</p>}
    </section>
  );
}

function AssignmentForm({ form, setForm, modules, error, busy, onSubmit }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleType = (id) => set({ submission_types: form.submission_types.includes(id) ? form.submission_types.filter((t) => t !== id) : [...form.submission_types, id] });
  return (
    <form onSubmit={onSubmit} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} noValidate>
      <div className="flex items-center justify-between">
        <h2 className="font-black text-lg text-text">{form.id ? 'Edit assignment' : 'New assignment'}</h2>
        <button type="button" className="secondary" aria-label="Close" onClick={() => setForm(null)}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        <label className="text-sm font-semibold text-text">Title
          <input className="field" maxLength={160} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-text">Module (optional)
          <select className="field" value={form.module_id} onChange={(e) => set({ module_id: e.target.value })}>
            <option value="">Whole course</option>
            {modules.map((m, i) => <option key={m.id} value={m.id}>Module {i + 1}: {m.title}</option>)}
          </select>
        </label>
        <label className="text-sm font-semibold text-text">Deadline
          <input className="field" type="datetime-local" value={form.due_at} onChange={(e) => set({ due_at: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-text">Points
          <input className="field" type="number" min={1} max={1000} value={form.max_points} onChange={(e) => set({ max_points: e.target.value })} />
        </label>
      </div>
      <label className="block text-sm font-semibold text-text">Instructions
        <span className="block font-normal text-text-muted">Paragraphs, "- " lists and **bold** are supported.</span>
        <textarea className="field min-h-32 font-normal" maxLength={10000} value={form.instructions} onChange={(e) => set({ instructions: e.target.value })} />
      </label>
      <fieldset>
        <legend className="text-sm font-semibold text-text">Students can hand in</legend>
        <div className="mt-2 space-y-2">
          {SUBMISSION_KINDS.map((k) => (
            <label key={k.id} className="flex items-start gap-2 text-text">
              <input type="checkbox" className="accent-brand w-4 h-4 mt-1" checked={form.submission_types.includes(k.id)} onChange={() => toggleType(k.id)} />
              <span><span className="font-semibold">{k.label}</span> <span className="text-text-muted text-sm">— {k.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-6">
        <label className="flex items-center gap-2 text-text"><input type="checkbox" className="accent-brand w-4 h-4" checked={form.allow_late} onChange={(e) => set({ allow_late: e.target.checked })} /> Accept late work (marked late)</label>
        <label className="flex items-center gap-2 text-text"><input type="checkbox" className="accent-brand w-4 h-4" checked={form.published} onChange={(e) => set({ published: e.target.checked })} /> Visible to students</label>
      </div>
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <div className="flex gap-2">
        <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> Save assignment</button>
        <button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button>
      </div>
    </form>
  );
}
