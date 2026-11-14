import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Save, Search, Trash2, X } from 'lucide-react';
import { listManagedCourses } from '../services/lms.js';
import { GLOSSARY_LIMITS, deleteGlossaryTerm, glossaryError, listGlossary, saveGlossaryTerm } from '../services/content.js';
import { AdminHeading, Empty, Notice, panel } from '../components/AdminUI.jsx';

const blank = { id: null, term: '', definition: '', simple: '', example: '', category: '' };

/** Instructor glossary: one searchable dictionary per course. Students see it on their Glossary page. */
export default function AdminGlossary() {
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [terms, setTerms] = useState(null);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState(null);
  const [fieldError, setFieldError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  useEffect(() => {
    listManagedCourses().then((c) => { setCourses(c); setCourse(c[0]?.id || ''); }).catch((e) => { setError(e.message); setCourses([]); });
  }, []);
  const load = useCallback(async () => {
    if (!course) return;
    setTerms(null);
    try { setTerms(await listGlossary(course)); } catch (e) { setError(e.message); setTerms([]); }
  }, [course]);
  useEffect(() => { load(); setForm(null); }, [load]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!terms) return [];
    return needle ? terms.filter((t) => [t.term, t.definition, t.simple, t.category].some((v) => v.toLowerCase().includes(needle))) : terms;
  }, [terms, query]);
  const categories = useMemo(() => [...new Set((terms || []).map((t) => t.category).filter(Boolean))].sort(), [terms]);

  async function save(e) {
    e.preventDefault();
    const problem = glossaryError(form);
    setFieldError(problem);
    if (problem) return;
    setBusy(true); setError(''); setInfo('');
    try { await saveGlossaryTerm(course, form); setInfo(form.id ? 'Term updated.' : 'Term added.'); setForm(null); await load(); }
    catch (err) { setFieldError(err.message); }
    finally { setBusy(false); }
  }
  async function remove(t) {
    if (!window.confirm(`Delete "${t.term}" from the glossary?`)) return;
    setBusy(true); setError(''); setInfo('');
    try { await deleteGlossaryTerm(t.id); setInfo('Term deleted.'); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const field = (key, label, multiline = false, hint = '') => (
    <label className="block text-sm font-semibold text-text">
      {label}{hint && <span className="block font-normal text-text-muted">{hint}</span>}
      {multiline
        ? <textarea className="field min-h-20 font-normal" maxLength={GLOSSARY_LIMITS[key]} value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        : <input className="field" maxLength={GLOSSARY_LIMITS[key]} value={form[key]} list={key === 'category' ? 'glossary-categories' : undefined} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />}
    </label>
  );

  return (
    <div className="space-y-6 pb-12">
      <AdminHeading title="Glossary" description="Terms and plain-language explanations for each course. Students search them on their Glossary page." />
      <Notice error={error} info={info} />
      {courses === null ? <p className="muted" role="status">Loading your courses...</p> : courses.length === 0 ? (
        <Empty text="Create a course before writing its glossary." to="/admin/courses" action="Create a course" />
      ) : (
        <>
          <div className={`${panel} p-5 flex flex-wrap gap-4 items-end`}>
            <label className="flex-1 min-w-56 font-bold text-sm text-text">Course
              <select className="field" value={course} onChange={(e) => setCourse(e.target.value)}>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </label>
            <label className="flex-1 min-w-56 font-bold text-sm text-text">Search
              <span className="relative block">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 mt-0.5 text-text-muted" aria-hidden="true" />
                <input className="field pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Term, definition or category" />
              </span>
            </label>
            <button className="primary" onClick={() => { setForm({ ...blank }); setFieldError(''); }} disabled={busy}><Plus size={16} aria-hidden="true" /> Add term</button>
          </div>

          {form && (
            <form onSubmit={save} className={`${panel} p-5 sm:p-6 space-y-4 border-brand/40`} noValidate>
              <div className="flex items-center justify-between">
                <h2 className="font-black text-lg text-text">{form.id ? `Edit "${form.term}"` : 'New term'}</h2>
                <button type="button" className="secondary" aria-label="Close" onClick={() => setForm(null)}><X size={16} aria-hidden="true" /></button>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                {field('term', 'Term')}
                {field('category', 'Category (optional)', false, 'Groups related terms on the student page.')}
              </div>
              {field('definition', 'Definition', true)}
              {field('simple', 'Simple explanation (optional)', true, 'Explain it as you would to a beginner.')}
              {field('example', 'Real-world example (optional)', true)}
              <datalist id="glossary-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              {fieldError && <p role="alert" className="text-danger text-sm">{fieldError}</p>}
              <div className="flex gap-2">
                <button className="primary" disabled={busy}><Save size={16} aria-hidden="true" /> Save term</button>
                <button type="button" className="secondary" onClick={() => setForm(null)}>Cancel</button>
              </div>
            </form>
          )}

          <section className={`${panel} overflow-hidden`}>
            <div className="p-5 flex items-center justify-between">
              <h2 className="font-black text-lg text-text">Terms</h2>
              <span className="muted">{terms ? `${shown.length} of ${terms.length}` : ''}</span>
            </div>
            {terms === null ? <p className="muted px-5 pb-5" role="status">Loading terms...</p>
              : terms.length === 0 ? <p className="muted px-5 pb-5">No terms yet. Add the first one.</p>
              : shown.length === 0 ? <p className="muted px-5 pb-5">No terms match "{query}".</p>
              : (
                <ul className="divide-y divide-border border-t border-border">
                  {shown.map((t) => (
                    <li key={t.id} className="p-4 sm:px-5 flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-text">{t.term}{t.category && <span className="ml-2 rounded-full bg-surface-muted px-2 py-0.5 text-xs font-semibold text-text-muted">{t.category}</span>}</p>
                        <p className="text-sm text-text-muted mt-1">{t.definition}</p>
                      </div>
                      <div className="flex gap-2">
                        <button className="secondary text-sm" disabled={busy} onClick={() => { setForm({ ...t }); setFieldError(''); }}><Pencil size={14} aria-hidden="true" /> Edit</button>
                        <button className="secondary !text-danger" disabled={busy} aria-label={`Delete ${t.term}`} onClick={() => remove(t)}><Trash2 size={14} aria-hidden="true" /></button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
          </section>
        </>
      )}
    </div>
  );
}
