import { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, ExternalLink, PlayCircle, Smile, Box, X } from 'lucide-react';
import { parseBlocks } from '../../lib/markdownBlocks.js';
import { parseSteps } from '../../lib/pageVersions.js';

// Renders one page from the database. Safe Markdown subset only: no HTML is ever interpreted.
// Glossary terms of the course are highlighted; tapping one opens its explanation.

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function useTermMatcher(glossary) {
  return useMemo(() => {
    const terms = (glossary || []).filter((t) => t.term?.trim()).sort((a, b) => b.term.length - a.term.length);
    if (!terms.length) return null;
    const byName = new Map(terms.map((t) => [t.term.toLowerCase(), t]));
    const re = new RegExp(`\\b(${terms.map((t) => escape(t.term)).join('|')})\\b`, 'gi');
    return { re, byName };
  }, [glossary]);
}

function WithTerms({ text, matcher, onTerm }) {
  if (!matcher) return text;
  const parts = text.split(matcher.re);
  return parts.map((part, i) => {
    const term = i % 2 === 1 ? matcher.byName.get(part.toLowerCase()) : null;
    if (!term) return part;
    return (
      <button key={i} type="button" className="term" onClick={() => onTerm(term)} aria-label={`What does ${term.term} mean?`}>
        {part}
      </button>
    );
  });
}

function Inline({ text, matcher, onTerm }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter((p) => p !== '');
  return parts.map((p, i) => {
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-surface-muted rounded px-1">{p.slice(1, -1)}</code>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
    return <WithTerms key={i} text={p} matcher={matcher} onTerm={onTerm} />;
  });
}

function Article({ text, matcher, onTerm }) {
  return (
    <div className="space-y-4 text-lg leading-8 text-text">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'h3') return <h3 key={i} className="font-extrabold text-xl pt-2">{b.text}</h3>;
        if (b.type === 'ul') return <ul key={i} className="list-disc pl-6 space-y-1">{b.items.map((it, j) => <li key={j}><Inline text={it} matcher={matcher} onTerm={onTerm} /></li>)}</ul>;
        return <p key={i}><Inline text={b.text} matcher={matcher} onTerm={onTerm} /></p>;
      })}
    </div>
  );
}

function Steps({ text, matcher, onTerm }) {
  const steps = parseSteps(text);
  return (
    <ol className="grid gap-3" aria-label="Steps">
      {steps.map((s, i) => (
        <li key={i} className="flex gap-4 rounded-2xl border border-border bg-surface-muted p-4">
          <span className="w-9 h-9 shrink-0 rounded-full bg-brand text-brand-contrast grid place-items-center font-extrabold" aria-hidden="true">{i + 1}</span>
          <div className="min-w-0">
            <h3 className="font-bold text-text"><Inline text={s.t} matcher={matcher} onTerm={onTerm} /></h3>
            {s.d && <p className="text-text-muted mt-1"><Inline text={s.d} matcher={matcher} onTerm={onTerm} /></p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function TermDialog({ term, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center bg-overlay/40 p-0 sm:p-4" role="presentation" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Explanation of ${term.term}`} onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-surface-raised rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-2xl font-black text-text">{term.term}</h2>
          <button ref={closeRef} type="button" className="secondary !p-2" onClick={onClose} aria-label="Close explanation"><X size={18} aria-hidden="true" /></button>
        </div>
        <TermDetails term={term} />
      </div>
    </div>
  );
}

export function TermDetails({ term }) {
  const rows = [
    [BookOpen, 'Definition', term.definition],
    [Smile, 'In simple words', term.simple],
    [Box, 'Real-world example', term.example],
  ].filter(([, , text]) => text);
  return (
    <dl className="mt-4 space-y-3">
      {rows.map(([Icon, label, text]) => (
        <div key={label} className="rounded-2xl bg-surface-muted p-4 flex gap-3">
          <Icon size={22} className="text-brand shrink-0 mt-0.5" aria-hidden="true" />
          <div><dt className="font-bold text-text">{label}</dt><dd className="text-text-muted mt-1">{text}</dd></div>
        </div>
      ))}
    </dl>
  );
}

/** A page of any kind. `content` is the already chosen version (default body or a level variant). */
export default function PageBody({ kind, content, glossary }) {
  const matcher = useTermMatcher(glossary);
  const [term, setTerm] = useState(null);
  let body;
  if (kind === 'steps') body = <Steps text={content} matcher={matcher} onTerm={setTerm} />;
  else if (kind === 'video' || kind === 'link') {
    const Icon = kind === 'video' ? PlayCircle : ExternalLink;
    body = (
      <a href={content} target="_blank" rel="noopener noreferrer" className="primary">
        <Icon size={18} aria-hidden="true" /> {kind === 'video' ? 'Watch the video' : 'Open the resource'}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  } else body = <Article text={content} matcher={matcher} onTerm={setTerm} />;
  return (
    <>
      {body}
      {term && <TermDialog term={term} onClose={() => setTerm(null)} />}
    </>
  );
}
