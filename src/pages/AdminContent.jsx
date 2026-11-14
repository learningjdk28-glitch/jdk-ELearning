import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, CheckCircle2, ExternalLink, FileText, FileUp, ListChecks, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { listManagedCourses, listModules, addModule, editModule, removeModule, listUnits, createUnit, editUnit, removeUnit, listQuizzes } from '../services/lms.js';
import { getMaterials, uploadMaterial, updateMaterial, deleteMaterial, openMaterial } from '../services/materials.js';
import { listActivities, listLevels, listVariants, syncVariants } from '../services/content.js';
import { MODULE_PAGE_COUNT, PAGE_KINDS, pageError, pageKind } from '../lib/courseRules.js';
import { AdminHeading, Notice, Empty, Status, panel } from '../components/AdminUI.jsx';

const blankPage = { title: '', kind: 'article', content: '', versions: {} };

export default function AdminContent() {
  const [params, setParams] = useSearchParams();
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState(params.get('course') || '');
  const [modules, setModules] = useState([]);
  const [selected, setSelected] = useState(null);
  const [levels, setLevels] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const loadModules = useCallback(async () => {
    if (!course) { setModules([]); return; }
    const data = await listModules(course);
    setModules(data);
    setSelected((cur) => (data.some((m) => m.id === cur) ? cur : data[0]?.id || null));
  }, [course]);

  useEffect(() => {
    Promise.all([listManagedCourses(), listLevels()])
      .then(([c, l]) => { setCourses(c); setLevels(l); setCourse((prev) => prev || c[0]?.id || ''); })
      .catch((e) => { setError(e.message); setCourses([]); });
  }, []);
  useEffect(() => { loadModules().catch((e) => setError(e.message)); }, [loadModules]);

  async function run(action, okMessage = 'Saved.') {
    setBusy(true); setError(''); setInfo('');
    try { await action(); setInfo(okMessage); return true; } catch (e) { setError(e.message); return false; } finally { setBusy(false); }
  }

  const current = modules.find((m) => m.id === selected);

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading
        title="Modules & materials"
        description={`Each module has exactly ${MODULE_PAGE_COUNT} pages, then a quiz or activity. Add pages, optional level versions and self-study files, then publish.`}
        action={<Link className="secondary" to="/admin/courses">Manage courses <BookOpen size={16} aria-hidden="true" /></Link>}
      />
      <Notice error={error} info={info} />

      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course before adding modules." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 flex flex-wrap gap-4 items-end`}>
            <label className="flex-1 min-w-56 font-bold text-sm text-text">
              Course
              <select className="field" value={course} onChange={(e) => { setCourse(e.target.value); setParams({ course: e.target.value }); }}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}{c.published ? '' : ' (draft)'}</option>)}
              </select>
            </label>
            <p className="muted">{modules.length} module{modules.length === 1 ? '' : 's'}</p>
          </div>

          <div className="grid xl:grid-cols-[340px_1fr] gap-5 items-start">
            <ModuleList modules={modules} selected={selected} onSelect={setSelected} busy={busy} course={course} run={run} reload={loadModules} />
            {current
              ? <ModuleEditor key={current.id} module={current} levels={levels} busy={busy} run={run} reloadModules={loadModules} />
              : <Empty text="Add or select a module to start adding pages." />}
          </div>
        </>
      )}
    </div>
  );
}

function ModuleList({ modules, selected, onSelect, busy, course, run, reload }) {
  const [title, setTitle] = useState('');
  async function add(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const ok = await run(async () => {
      const row = await addModule({ course_id: course, title: title.trim(), description: '', position: modules.length });
      await reload();
      onSelect(row.id);
    }, 'Module added. Now add its pages.');
    if (ok) setTitle('');
  }
  return (
    <div className="space-y-4">
      <section className={`${panel} p-4`}>
        <h2 className="font-black text-text px-2 pb-3">Modules</h2>
        {modules.length === 0 && <p className="muted px-2 pb-2">No modules yet.</p>}
        <ol className="space-y-2">
          {modules.map((m, i) => (
            <li key={m.id}>
              <button type="button" onClick={() => onSelect(m.id)}
                className={`w-full text-left rounded-xl p-3 border ${selected === m.id ? 'bg-brand-soft border-brand/40' : 'bg-surface-raised border-border hover:bg-surface-muted'}`}>
                <span className="block text-xs text-text-muted">Module {i + 1}</span>
                <span className="block font-bold text-text mt-0.5">{m.title}</span>
                <span className="mt-2 inline-block"><Status value={m.published} /></span>
              </button>
            </li>
          ))}
        </ol>
      </section>
      <form onSubmit={add} className={`${panel} p-5 space-y-3`}>
        <h2 className="font-black text-text flex gap-2 items-center"><Plus size={18} className="text-brand" aria-hidden="true" /> New module</h2>
        <label className="block text-sm font-semibold text-text">Module title
          <input className="field" maxLength={150} required value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <button className="primary w-full" disabled={busy || !title.trim()}>Add module</button>
      </form>
    </div>
  );
}

function ModuleEditor({ module, levels, busy, run, reloadModules }) {
  const [pages, setPages] = useState(null);
  const [variants, setVariants] = useState([]);
  const [extras, setExtras] = useState({ quizzes: [], activities: [], materials: [] });
  const [editing, setEditing] = useState(null); // { slot, unitId|null, ...page }
  const [details, setDetails] = useState({ title: module.title, description: module.description || '' });
  const versionLevels = useMemo(() => levels.filter((l) => !l.is_default), [levels]);

  const load = useCallback(async () => {
    const [units, quizzes, activities, materials] = await Promise.all([listUnits(module.id), listQuizzes(module.id), listActivities(module.id), getMaterials(module.id)]);
    setPages(units);
    setVariants(await listVariants(units.map((u) => u.id)));
    setExtras({ quizzes, activities, materials });
  }, [module.id]);
  useEffect(() => { load().catch(() => setPages([])); }, [load]);

  const slots = useMemo(() => {
    const list = Array.from({ length: MODULE_PAGE_COUNT }, () => null);
    const overflow = [];
    for (const u of pages || []) {
      const free = list[u.position] === null && u.position < MODULE_PAGE_COUNT ? u.position : list.indexOf(null);
      if (free >= 0) list[free] = u; else overflow.push(u);
    }
    return { list, overflow };
  }, [pages]);
  const count = pages?.length ?? 0;
  const versionsOf = (unitId) => Object.fromEntries(variants.filter((v) => v.unit_id === unitId).map((v) => [v.level_id, v.content]));

  function open(slot, unit) {
    setEditing(unit
      ? { slot, unitId: unit.id, title: unit.title, kind: unit.kind, content: unit.content, versions: versionsOf(unit.id) }
      : { slot, unitId: null, ...blankPage });
  }

  async function savePage(e) {
    e.preventDefault();
    const problem = pageError(editing);
    if (problem) return run(async () => { throw new Error(problem); });
    const ok = await run(async () => {
      const fields = { title: editing.title.trim(), kind: editing.kind, content: editing.content.trim() };
      const unit = editing.unitId ? await editUnit(editing.unitId, fields) : await createUnit({ ...fields, module_id: module.id, position: editing.slot, published: false });
      const keep = pageKind(editing.kind).variants ? editing.versions : {};
      await syncVariants(unit.id, keep, versionLevels.map((l) => l.id));
      await load();
    }, 'Page saved.');
    if (ok) setEditing(null);
  }

  return (
    <div className="space-y-5 min-w-0">
      <section className={`${panel} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-brand">Module</p>
            <h2 className="font-black text-xl text-text mt-1">{module.title}</h2>
            <p className={`mt-1 text-sm font-semibold ${count === MODULE_PAGE_COUNT ? 'text-success' : 'text-warning'}`}>
              {count} of {MODULE_PAGE_COUNT} pages{count === MODULE_PAGE_COUNT ? ' — ready to publish' : ` — add ${MODULE_PAGE_COUNT - count} more to publish`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="primary" disabled={busy || (!module.published && count !== MODULE_PAGE_COUNT)}
              title={!module.published && count !== MODULE_PAGE_COUNT ? `A module needs exactly ${MODULE_PAGE_COUNT} pages to be published` : undefined}
              onClick={() => run(async () => { await editModule(module.id, { published: !module.published }); await reloadModules(); await load(); }, module.published ? 'Module unpublished.' : 'Module published. Students can see it now.')}>
              {module.published ? 'Unpublish' : 'Publish module'}
            </button>
            <button className="secondary !text-danger" disabled={busy} aria-label={`Delete module ${module.title}`}
              onClick={() => { if (window.confirm(`Delete "${module.title}" with all its pages, quiz, activities and files?`)) run(async () => { await removeModule(module.id); await reloadModules(); }, 'Module deleted.'); }}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
        <form className="mt-5 grid gap-3" onSubmit={(e) => { e.preventDefault(); run(async () => { await editModule(module.id, { title: details.title.trim(), description: details.description.trim() }); await reloadModules(); }, 'Module details saved.'); }}>
          <label className="text-sm font-semibold text-text">Title
            <input className="field" maxLength={150} required value={details.title} onChange={(e) => setDetails((d) => ({ ...d, title: e.target.value }))} />
          </label>
          <label className="text-sm font-semibold text-text">Description and goals (shown before the first page)
            <textarea className="field min-h-24 font-normal" maxLength={4000} value={details.description} onChange={(e) => setDetails((d) => ({ ...d, description: e.target.value }))} />
          </label>
          <div><button className="secondary" disabled={busy || !details.title.trim()}><Save size={16} aria-hidden="true" /> Save details</button></div>
        </form>
      </section>

      <section className={`${panel} p-5 sm:p-6`} aria-labelledby="pages-heading">
        <h3 id="pages-heading" className="font-black text-lg text-text">Pages</h3>
        {module.published && <p className="muted mt-1">This module is published. You can edit pages; unpublish it to remove or replace a page.</p>}
        {pages === null ? <p className="muted mt-3" role="status">Loading pages...</p> : (
          <ol className="mt-4 space-y-2">
            {slots.list.map((unit, slot) => (
              <li key={slot} className={`rounded-xl border p-3 flex flex-wrap items-center justify-between gap-3 ${unit ? 'border-border' : 'border-dashed border-border bg-surface-muted'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-brand-soft text-brand grid place-items-center text-sm font-black">{slot + 1}</span>
                  {unit ? (
                    <div className="min-w-0">
                      <p className="font-bold text-text truncate">{unit.title}</p>
                      <p className="text-xs text-text-muted">
                        {pageKind(unit.kind).label}
                        {Object.keys(versionsOf(unit.id)).map((lv) => ` · ${levels.find((l) => l.id === lv)?.label || lv} version`).join('')}
                      </p>
                    </div>
                  ) : <p className="text-text-muted">Empty page {slot + 1}</p>}
                </div>
                <div className="flex gap-2">
                  {unit ? (
                    <>
                      <button className="secondary text-sm" disabled={busy} onClick={() => open(slot, unit)}><Pencil size={14} aria-hidden="true" /> Edit</button>
                      <button className="secondary !text-danger" disabled={busy || module.published} aria-label={`Delete page ${unit.title}`}
                        title={module.published ? 'Unpublish the module to remove a page' : undefined}
                        onClick={() => { if (window.confirm(`Delete page "${unit.title}"?`)) run(async () => { await removeUnit(unit.id); await load(); }, 'Page deleted.'); }}>
                        <Trash2 size={14} aria-hidden="true" />
                      </button>
                    </>
                  ) : (
                    <button className="secondary text-sm" disabled={busy || module.published} onClick={() => open(slot, null)}><Plus size={14} aria-hidden="true" /> Add page</button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {slots.overflow.length > 0 && <p className="mt-3 text-sm text-warning">This module has {count} pages, more than {MODULE_PAGE_COUNT}. Delete {count - MODULE_PAGE_COUNT} so it can be published.</p>}
      </section>

      {editing && (
        <PageEditor editing={editing} setEditing={setEditing} versionLevels={versionLevels} busy={busy} onSubmit={savePage} />
      )}

      <section className={`${panel} p-5 sm:p-6`}>
        <h3 className="font-black text-lg text-text flex items-center gap-2"><ListChecks size={20} className="text-brand" aria-hidden="true" /> After the pages</h3>
        <p className="muted mt-1">Students take these after page {MODULE_PAGE_COUNT}.</p>
        <ul className="mt-3 space-y-2">
          {extras.quizzes.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <span className="font-semibold text-text">Quiz: {z.title}</span>
              <span className="flex items-center gap-2"><Status value={z.published} /><Link className="secondary text-sm" to="/admin/assessments">Edit questions</Link></span>
            </li>
          ))}
          {extras.activities.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
              <span className="font-semibold text-text">Activity ({a.kind}): {a.title}</span>
              <Status value={a.published} />
            </li>
          ))}
          {extras.quizzes.length + extras.activities.length === 0 && <li className="muted">No quiz or activity yet. Add a quiz on the Assessments page.</li>}
        </ul>
        {extras.activities.length > 0 && <p className="muted mt-3">Activity editing arrives with the assessment tools (Phase 5).</p>}
      </section>

      <Materials moduleId={module.id} materials={extras.materials} busy={busy} run={run} reload={load} />
    </div>
  );
}

function PageEditor({ editing, setEditing, versionLevels, busy, onSubmit }) {
  const kind = pageKind(editing.kind);
  const set = (patch) => setEditing((p) => ({ ...p, ...patch }));
  const setVersion = (levelId, text) => setEditing((p) => ({ ...p, versions: { ...p.versions, [levelId]: text } }));
  const removeVersion = (levelId) => setEditing((p) => { const v = { ...p.versions }; delete v[levelId]; return { ...p, versions: v }; });
  return (
    <form onSubmit={onSubmit} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} aria-labelledby="page-editor-title" noValidate>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Page {editing.slot + 1} of {MODULE_PAGE_COUNT}</p>
          <h3 id="page-editor-title" className="font-black text-xl text-text mt-1">{editing.unitId ? 'Edit page' : 'New page'}</h3>
        </div>
        <button type="button" className="secondary" aria-label="Close editor" onClick={() => setEditing(null)}><X size={16} aria-hidden="true" /></button>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className="text-sm font-semibold text-text">Page title
          <input className="field" maxLength={160} value={editing.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="text-sm font-semibold text-text">Page type
          <select className="field" value={editing.kind} onChange={(e) => set({ kind: e.target.value })}>
            {PAGE_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-sm font-semibold text-text">{kind.variants ? 'Page content' : 'Link'}
        <span className="block font-normal text-text-muted">{kind.hint}</span>
        {kind.variants
          ? <textarea className="field min-h-40 font-normal" maxLength={50000} value={editing.content} onChange={(e) => set({ content: e.target.value })} />
          : <input className="field" type="url" value={editing.content} onChange={(e) => set({ content: e.target.value })} placeholder="https://" />}
      </label>

      {kind.variants && versionLevels.length > 0 && (
        <fieldset className="rounded-2xl border border-border p-4 space-y-3">
          <legend className="px-2 text-sm font-bold text-text">Level versions <span className="font-normal text-text-muted">(optional)</span></legend>
          <p className="muted">Not required to publish. Students placed at a level see that version if it exists, otherwise the page above. They can always switch.</p>
          {versionLevels.map((level) => (
            editing.versions[level.id] === undefined ? (
              <button key={level.id} type="button" className="secondary text-sm mr-2" onClick={() => setVersion(level.id, '')}>
                <Plus size={14} aria-hidden="true" /> Add {level.label.toLowerCase()} version
                <span className="ml-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">optional</span>
              </button>
            ) : (
              <label key={level.id} className="block text-sm font-semibold text-text">
                <span className="flex items-center justify-between gap-2">
                  {level.label} version{level.student_label ? <span className="font-normal text-text-muted"> — students see "{level.student_label}"</span> : null}
                  <button type="button" className="text-sm text-danger underline" onClick={() => removeVersion(level.id)}>Remove</button>
                </span>
                <textarea className="field min-h-28 font-normal" maxLength={50000} value={editing.versions[level.id]} onChange={(e) => setVersion(level.id, e.target.value)} />
              </label>
            )
          ))}
        </fieldset>
      )}

      <div className="flex flex-wrap gap-2">
        <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> Save page</button>
        <button type="button" className="secondary" onClick={() => setEditing(null)}>Cancel</button>
      </div>
    </form>
  );
}

function Materials({ moduleId, materials, busy, run, reload }) {
  return (
    <section className={`${panel} p-5 sm:p-6 space-y-4`}>
      <div className="flex gap-2 items-center">
        <FileUp size={22} className="text-brand" aria-hidden="true" />
        <div>
          <h3 className="text-lg font-black text-text">Self-study materials</h3>
          <p className="text-xs text-text-muted">Extra files students can open or download. PDF, DOCX, PPTX, TXT, PNG, JPG · 25 MB per file</p>
        </div>
      </div>
      <label className="block border-2 border-dashed border-border bg-surface-muted rounded-2xl p-6 text-center cursor-pointer hover:border-brand/50">
        <FileUp size={28} className="mx-auto mb-2 text-brand" aria-hidden="true" />
        <span className="font-bold text-brand">Choose files to upload</span>
        <input className="block text-xs mx-auto mt-3 max-w-full" type="file" disabled={busy} accept=".pdf,.docx,.pptx,.txt,.png,.jpg,.jpeg" multiple
          onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ''; if (files.length) run(async () => { for (const f of files) await uploadMaterial(moduleId, f); await reload(); }, 'Uploaded.'); }} />
      </label>
      <ul className="space-y-2">
        {materials.map((f) => (
          <li className="border border-border rounded-xl p-3 flex items-center gap-3" key={f.id}>
            <FileText size={22} className="text-brand shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-sm text-text break-all">{f.title}</p>
              <p className="text-xs text-text-muted">{(f.file_size / 1024 / 1024).toFixed(2)} MB · {f.published ? 'Visible to students' : 'Hidden'}</p>
            </div>
            <button className="secondary text-xs" disabled={busy} onClick={() => run(async () => { await updateMaterial(f.id, { published: !f.published }); await reload(); })}>
              {f.published ? 'Hide' : <><CheckCircle2 size={14} aria-hidden="true" /> Show</>}
            </button>
            <button className="secondary" aria-label={`Open ${f.title}`} onClick={() => openMaterial(f).catch((e) => run(async () => { throw e; }))}><ExternalLink size={16} aria-hidden="true" /></button>
            <button className="secondary !text-danger" disabled={busy} aria-label={`Delete ${f.title}`}
              onClick={() => { if (window.confirm(`Remove ${f.title}?`)) run(async () => { await deleteMaterial(f); await reload(); }, 'File removed.'); }}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
          </li>
        ))}
        {materials.length === 0 && <li className="muted">No files uploaded yet.</li>}
      </ul>
    </section>
  );
}
