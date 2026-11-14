import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadMyGlossary } from '../services/learn.js';
import { TermDetails } from '../components/learn/PageBody.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/** Searchable dictionary of the terms in the student's enrolled courses, written by their instructors. */
export default function Glossary() {
  const { data, loading, error, reload } = useLoad(loadMyGlossary, []);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const detailRef = useRef(null);
  const course = params.get('course') || '';

  const courses = useMemo(() => [...new Map((data || []).map((t) => [t.course_id, t.courseTitle])).entries()], [data]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (data || []).filter((t) => (!course || t.course_id === course)
      && (!needle || [t.term, t.definition, t.simple].some((v) => (v || '').toLowerCase().includes(needle))));
  }, [data, course, query]);
  const groups = useMemo(() => {
    const map = new Map();
    for (const t of filtered) {
      const key = t.category || 'Other terms';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return [...map.entries()].sort(([a], [b]) => (a === 'Other terms') - (b === 'Other terms') || a.localeCompare(b));
  }, [filtered]);
  const selected = filtered.find((t) => t.id === selectedId) || null;

  useEffect(() => { if (selected && window.innerWidth < 1024) detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, [selected]);

  if (loading) return <LoadingState label="Loading glossary..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  return (
    <div className="max-w-6xl mx-auto pb-12">
      <h1 className="text-3xl font-black text-text">Glossary</h1>
      <p className="text-text-muted mt-1">Terms from your courses, explained by your instructors.</p>

      {data.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="No glossary terms yet" action={<Link className="primary" to="/catalog"><BookOpen size={16} aria-hidden="true" /> Explore courses</Link>}>
            Terms appear here for the courses you are enrolled in.
          </EmptyState>
        </div>
      ) : (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
            <label className="relative block">
              <span className="sr-only">Search terms</span>
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
              <input className="field mt-0 pl-11" type="search" placeholder="Search a term or meaning" value={query} onChange={(e) => setQuery(e.target.value)} />
            </label>
            {courses.length > 1 && (
              <label>
                <span className="sr-only">Course</span>
                <select className="field mt-0" value={course} onChange={(e) => setParams(e.target.value ? { course: e.target.value } : {})}>
                  <option value="">All my courses</option>
                  {courses.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="text-sm text-text-muted mt-3" role="status">{filtered.length} term{filtered.length === 1 ? '' : 's'}</p>

          <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_420px] items-start">
            <div className="space-y-5">
              {groups.length === 0 && <EmptyState title={`No terms match "${query}"`}>Try a shorter word.</EmptyState>}
              {groups.map(([category, terms]) => (
                <section key={category} aria-labelledby={`cat-${category}`}>
                  <h2 id={`cat-${category}`} className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">{category} ({terms.length})</h2>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {terms.map((t) => (
                      <li key={t.id}>
                        <button type="button" onClick={() => setSelectedId(t.id)} aria-pressed={selectedId === t.id}
                          className={`w-full text-left rounded-2xl border p-3 ${selectedId === t.id ? 'border-brand bg-brand-soft' : 'border-border bg-surface-raised hover:bg-surface-muted'}`}>
                          <span className="block font-bold text-text">{t.term}</span>
                          <span className="block text-sm text-text-muted line-clamp-2">{t.simple || t.definition}</span>
                          {courses.length > 1 && !course && <span className="block text-xs text-text-muted mt-1">{t.courseTitle}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
            <aside ref={detailRef} className="panel p-5 lg:sticky lg:top-24" aria-live="polite">
              {selected ? (
                <>
                  <p className="text-xs font-bold uppercase tracking-wider text-text-muted">{selected.courseTitle}</p>
                  <h2 className="text-2xl font-black text-text mt-1">{selected.term}</h2>
                  <TermDetails term={selected} />
                </>
              ) : <p className="text-text-muted">Choose a term to see its meaning.</p>}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
