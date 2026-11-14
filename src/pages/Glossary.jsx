import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { GLOSSARY, GLOSSARY_CATEGORIES } from '../data/glossary.js';
import { LESSONS } from '../data/lessons.js';
import { Eli5Card } from '../components/Eli5.jsx';
import { BackHeader } from '../components/ui.jsx';

const ALL = Object.keys(GLOSSARY).sort();

export default function Glossary() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const terms = useMemo(() => ALL.filter((t) => t.includes(query.trim().toLowerCase())), [query]);

  // Related terms: other terms taught in the same lesson(s).
  const related = useMemo(() => {
    if (!selected) return [];
    const set = new Set();
    for (const l of LESSONS) if (l.terms.includes(selected)) l.terms.forEach((t) => t !== selected && set.add(t));
    return [...set].filter((t) => GLOSSARY[t]);
  }, [selected]);

  return (
    <div className="w-full">
      <BackHeader title="Glossary (ELI5)" to="/dashboard" />
      <label className="relative block mb-5 lg:max-w-xl">
        <span className="sr-only">Search terms</span>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} aria-hidden="true" />
        <input
          className="w-full rounded-2xl border border-indigo-100 bg-white py-3.5 pl-12 pr-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          type="search"
          placeholder="Search a term..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-10 items-start">
        <div>
        <h2 className="font-extrabold text-lg mb-3">{selected ? 'All terms' : 'Tap a term to explain it'}</h2>
        {terms.length === 0 && <p className="muted">No matching term.</p>}
        <div className="space-y-6">
          {GLOSSARY_CATEGORIES.map((cat) => {
            const inCat = cat.terms.filter((t) => terms.includes(t));
            if (inCat.length === 0) return null;
            return (
              <section key={cat.id} aria-labelledby={`cat-${cat.id}`}>
                <h3 id={`cat-${cat.id}`} className="text-sm font-extrabold tracking-wide text-slate-600 mb-2">
                  {cat.title.toUpperCase()} <span className="font-semibold">({inCat.length})</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {inCat.map((t) => (
                    <button
                      key={t}
                      aria-pressed={selected === t}
                      onClick={() => setSelected(t)}
                      className={`rounded-full border px-4 min-h-[44px] font-semibold capitalize ${selected === t ? 'bg-brand text-white border-brand' : 'bg-white border-indigo-200 text-brand hover:bg-indigo-50'}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        </div>
        <aside className="order-first lg:order-none lg:sticky lg:top-24" aria-live="polite">
        {selected && GLOSSARY[selected] && (
          <section className="lg:mb-0" aria-label={`Explanation of ${selected}`}>
            <h2 className="text-3xl font-extrabold capitalize mb-4">{selected}</h2>
            <Eli5Card term={selected} />
            {related.length > 0 && (
              <div className="mt-5">
                <p className="text-sm font-extrabold tracking-wide text-slate-600">RELATED TERMS</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {related.map((t) => (
                    <button key={t} className="secondary capitalize text-brand" onClick={() => setSelected(t)}>{t}</button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {!(selected && GLOSSARY[selected]) && (
          <div className="hidden lg:grid place-items-center rounded-3xl border border-dashed border-indigo-200 bg-white/60 p-10 text-center text-slate-600">
            Pick a term to see a simple explanation, a real-world example and related terms.
          </div>
        )}
        </aside>
      </div>

      <p className="flex items-center justify-center gap-2 text-green-800 font-semibold mt-8">
        <Check size={18} aria-hidden="true" /> All {ALL.length} glossary terms are saved for offline use
      </p>
    </div>
  );
}
