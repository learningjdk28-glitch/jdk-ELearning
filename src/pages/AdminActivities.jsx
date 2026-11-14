import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { listManagedCourses, listModules } from '../services/lms.js';
import { deleteActivity, getActivitiesAdmin, saveActivity, setActivityPublished } from '../services/content.js';
import { ACTIVITY_KINDS, ACTIVITY_LIMITS as L, activityError, buildSpec, formFromSpec, newPartId } from '../lib/activityRules.js';
import Activity from '../components/Activity.jsx';
import { AdminHeading, Empty, Notice, Status, panel } from '../components/AdminUI.jsx';

const kindLabel = (id) => ACTIVITY_KINDS.find((k) => k.id === id)?.label || id;
const blank = (kind) => ({ id: null, kind, title: '', prompt: '', published: false, ...formFromSpec(kind) });

/** Instructor practice activities: create, edit, preview, publish, and see how many students finished each. */
export default function AdminActivities() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [modules, setModules] = useState([]);
  const [moduleId, setModuleId] = useState('');
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); });
  }, []);
  useEffect(() => {
    if (!course) return;
    setModules([]); setModuleId('');
    listModules(course).then((m) => { setModules(m); setModuleId(m[0]?.id || ''); }).catch((e) => setError(e.message));
  }, [course]);
  const load = useCallback(async () => {
    if (!moduleId) { setData(null); return; }
    setData(null);
    try { setData(await getActivitiesAdmin(moduleId)); } catch (e) { setError(e.message); setData({ activities: [], enrolled: 0 }); }
  }, [moduleId]);
  useEffect(() => { load(); setForm(null); }, [load]);

  async function run(action, ok) {
    setBusy(true); setError(''); setInfo('');
    try { await action(); setInfo(ok); await load(); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }
  async function save(e) {
    e.preventDefault();
    const spec = buildSpec(form.kind, form);
    const problem = !form.title.trim() ? 'Give the activity a title.' : activityError(form.kind, spec);
    setFormError(problem);
    if (problem) return;
    const position = form.id ? form.position : data.activities.length;
    setBusy(true); setError(''); setInfo('');
    try { await saveActivity(moduleId, { ...form, spec, position }); setInfo(form.id ? 'Activity saved.' : 'Activity created.'); setForm(null); await load(); }
    catch (err) { setFormError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Activities" description="Short practice tasks at the end of a module: sorting, ordering, spotting red flags, or a password check. They are not graded; you see how many students finished each one." />
      <Notice error={error} info={info} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course first." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 grid md:grid-cols-2 gap-4`}>
            <label className="font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => setCourse(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label className="font-bold text-sm text-text">Module
              <select className="field" value={moduleId} onChange={(e) => setModuleId(e.target.value)} disabled={modules.length === 0}>
                {modules.length === 0 && <option value="">No modules yet</option>}
                {modules.map((m, i) => <option key={m.id} value={m.id}>Module {i + 1}: {m.title}</option>)}
              </select>
            </label>
          </div>

          {!moduleId ? <Empty text="Add a module to this course first." to="/admin/content" action="Add modules" /> : !data ? <p className="muted" role="status">Loading activities...</p> : (
            <>
              {!form && (
                <section className={`${panel} p-5`} aria-labelledby="new-activity">
                  <h2 id="new-activity" className="font-black text-text">New activity</h2>
                  <div className="mt-3 grid sm:grid-cols-2 gap-2">
                    {ACTIVITY_KINDS.map((k) => (
                      <button key={k.id} className="rounded-xl border border-border bg-surface-raised p-3 text-left hover:border-brand/50" disabled={busy}
                        onClick={() => { setForm(blank(k.id)); setFormError(''); }}>
                        <span className="flex items-center gap-2 font-bold text-text"><Plus size={16} className="text-brand" aria-hidden="true" /> {k.label}</span>
                        <span className="block text-sm text-text-muted mt-1">{k.hint}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {form && <ActivityForm form={form} setForm={setForm} error={formError} busy={busy} onSubmit={save} />}

              {data.activities.length === 0 ? <Empty text="No activities in this module yet." /> : (
                <ul className="space-y-3">
                  {data.activities.map((a) => (
                    <li key={a.id} className={`${panel} p-5 flex flex-wrap items-center justify-between gap-4`}>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{kindLabel(a.kind)}</p>
                        <p className="font-bold text-text mt-1">{a.title}</p>
                        <p className="text-sm text-text-muted mt-1">{a.completed} of {data.enrolled} enrolled student{data.enrolled === 1 ? '' : 's'} finished it</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Status value={a.published} />
                        <button className="secondary text-sm" disabled={busy} onClick={() => run(() => setActivityPublished(a.id, !a.published), a.published ? 'Activity hidden from students.' : 'Activity published.')}>
                          {a.published ? 'Unpublish' : 'Publish'}
                        </button>
                        <button className="secondary text-sm" disabled={busy} onClick={() => { setForm({ ...a, ...formFromSpec(a.kind, a.spec) }); setFormError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Pencil size={14} aria-hidden="true" /> Edit</button>
                        <button className="secondary !text-danger" disabled={busy} aria-label={`Delete ${a.title}`}
                          onClick={() => { if (window.confirm(`Delete "${a.title}"? Student completions for it are removed too.`)) run(() => deleteActivity(a.id), 'Activity deleted.'); }}>
                          <Trash2 size={14} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function ActivityForm({ form, setForm, error, busy, onSubmit }) {
  const [preview, setPreview] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const spec = buildSpec(form.kind, form);
  const specProblem = activityError(form.kind, spec);
  return (
    <form onSubmit={onSubmit} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} noValidate>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-black text-lg text-text">{form.id ? 'Edit' : 'New'} activity · {kindLabel(form.kind)}</h2>
        <button type="button" className="secondary" aria-label="Close" onClick={() => setForm(null)}><X size={16} aria-hidden="true" /></button>
      </div>
      <label className="block text-sm font-semibold text-text">Title
        <input className="field" maxLength={L.title} value={form.title} onChange={(e) => set({ title: e.target.value })} />
      </label>
      <label className="block text-sm font-semibold text-text">Instructions for students
        <textarea className="field min-h-16 font-normal" maxLength={L.prompt} value={form.prompt} onChange={(e) => set({ prompt: e.target.value })}
          placeholder={form.kind === 'sort' ? 'Tap an item, then tap its group.' : form.kind === 'order' ? 'Use the arrows to put the steps in order, then press Check.' : form.kind === 'spot' ? 'Tap every part that looks suspicious, then press Check.' : 'Type a practice password and watch the checklist. Never use a real password.'} />
      </label>

      {form.kind === 'sort' && <SortEditor form={form} setForm={setForm} />}
      {form.kind === 'order' && <OrderEditor form={form} setForm={setForm} />}
      {form.kind === 'spot' && <SpotEditor form={form} setForm={setForm} />}
      {form.kind === 'password' && <p className="text-sm text-text-muted">This activity has no settings. Students see a fixed strength checklist; what they type is never saved.</p>}

      <label className="flex items-center gap-2 text-text"><input type="checkbox" className="accent-brand w-4 h-4" checked={form.published} onChange={(e) => set({ published: e.target.checked })} /> Visible to students</label>
      {error && <p role="alert" className="text-danger text-sm">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> Save activity</button>
        <button type="button" className="secondary" onClick={() => setPreview((p) => !p)} aria-expanded={preview}><Eye size={16} aria-hidden="true" /> {preview ? 'Hide preview' : 'Preview'}</button>
        <button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button>
      </div>
      {preview && (specProblem
        ? <p className="text-sm text-warning">Preview appears when the settings are complete: {specProblem}</p>
        : <Activity key={JSON.stringify(spec)} activity={{ type: form.kind, title: form.title || 'Untitled activity', prompt: form.prompt, ...spec }} />)}
    </form>
  );
}

/** A list of rows with add, remove and optional move up/down. */
function Rows({ label, items, min, max, onChange, make, render, movable = false, addLabel }) {
  const move = (i, d) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; onChange(n); };
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-text">{label}</legend>
      {items.map((item, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          {movable && <span className="w-6 text-center font-bold text-text-muted" aria-hidden="true">{i + 1}</span>}
          <div className="flex-1 min-w-0 flex flex-wrap gap-2">{render(item, i, (patch) => onChange(items.map((x, j) => (j === i ? (typeof x === 'string' ? patch : { ...x, ...patch }) : x))))}</div>
          {movable && <button type="button" className="secondary !p-2" disabled={i === 0} aria-label={`Move ${i + 1} up`} onClick={() => move(i, -1)}><ArrowUp size={14} /></button>}
          {movable && <button type="button" className="secondary !p-2" disabled={i === items.length - 1} aria-label={`Move ${i + 1} down`} onClick={() => move(i, 1)}><ArrowDown size={14} /></button>}
          <button type="button" className="secondary !p-2" disabled={items.length <= min} aria-label={`Remove ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}><X size={14} /></button>
        </div>
      ))}
      {items.length < max && <button type="button" className="secondary text-sm" onClick={() => onChange([...items, make()])}><Plus size={14} aria-hidden="true" /> {addLabel}</button>}
    </fieldset>
  );
}

function SortEditor({ form, setForm }) {
  const groups = form.groups.map((g) => g.trim()).filter(Boolean);
  return (
    <>
      <Rows label="Groups" items={form.groups} min={L.groups[0]} max={L.groups[1]} addLabel="Add group" make={() => ''}
        onChange={(g) => setForm((f) => ({ ...f, groups: g }))}
        render={(g, i, update) => <input className="field mt-0 flex-1" maxLength={L.groupName} placeholder={`Group ${i + 1}`} value={g} onChange={(e) => update(e.target.value)} />} />
      <Rows label="Items and their correct group" items={form.items} min={L.items[0]} max={L.items[1]} addLabel="Add item" make={() => ({ id: newPartId(), label: '', group: '' })}
        onChange={(items) => setForm((f) => ({ ...f, items }))}
        render={(item, i, update) => (
          <>
            <input className="field mt-0 flex-1 min-w-48" maxLength={L.itemLabel} placeholder={`Item ${i + 1}`} value={item.label} onChange={(e) => update({ label: e.target.value })} />
            <select className="field mt-0 w-auto" aria-label={`Group for item ${i + 1}`} value={item.group} onChange={(e) => update({ group: e.target.value })}>
              <option value="">Choose group</option>
              {groups.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </>
        )} />
    </>
  );
}

function OrderEditor({ form, setForm }) {
  return (
    <>
      <Rows label="Steps in the correct order" items={form.steps} min={L.steps[0]} max={L.steps[1]} addLabel="Add step" make={() => ''} movable
        onChange={(steps) => setForm((f) => ({ ...f, steps }))}
        render={(s, i, update) => <input className="field mt-0 flex-1" maxLength={L.stepText} placeholder={`Step ${i + 1}`} value={s} onChange={(e) => update(e.target.value)} />} />
      <p className="text-sm text-text-muted">Students see these steps shuffled.</p>
    </>
  );
}

function SpotEditor({ form, setForm }) {
  return (
    <Rows label="Parts of the message (tick the red flags)" items={form.segments} min={L.segments[0]} max={L.segments[1]} addLabel="Add part"
      make={() => ({ id: newPartId(), text: '', flag: false, why: '' })}
      onChange={(segments) => setForm((f) => ({ ...f, segments }))}
      render={(s, i, update) => (
        <div className="w-full rounded-xl border border-border p-3 space-y-2">
          <input className="field mt-0" maxLength={L.segmentText} placeholder={`Part ${i + 1}, e.g. "URGENT: reply within 1 hour"`} value={s.text} onChange={(e) => update({ text: e.target.value })} />
          <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" className="accent-brand w-4 h-4" checked={s.flag} onChange={(e) => update({ flag: e.target.checked })} /> This is a red flag</label>
          <input className="field mt-0" maxLength={L.why} placeholder="Why (shown after checking)" value={s.why || ''} onChange={(e) => update({ why: e.target.value })} />
        </div>
      )} />
  );
}
