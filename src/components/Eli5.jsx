import { useEffect, useRef } from 'react';
import { BookOpen, Box, Smile, X } from 'lucide-react';
import { GLOSSARY, GLOSSARY_TERMS } from '../data/glossary.js';

export function Eli5Card({ term }) {
  const entry = GLOSSARY[term];
  if (!entry) return null;
  const cards = [
    ['Technical Definition', entry[0], 'bg-blue-50', BookOpen, 'text-blue-600'],
    ['ELI5 (Explain Like I am 5)', entry[1], 'bg-amber-50', Smile, 'text-amber-500'],
    ['Real-World Example', entry[2], 'bg-violet-50', Box, 'text-violet-600'],
  ];
  return (
    <div className="space-y-3">
      {cards.map(([title, text, bg, Icon, color]) => (
        <div key={title} className={`rounded-3xl p-4 flex gap-4 ${bg}`}>
          <div className="w-11 h-11 rounded-2xl bg-white grid place-items-center shrink-0">
            <Icon size={22} className={color} aria-hidden="true" />
          </div>
          <div>
            <p className="font-extrabold">{title}</p>
            <p className="mt-1 text-slate-700 leading-7">{text}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Modal with the three ELI5 parts. Content is bundled, so it works offline. */
export function TermDialog({ term, onClose }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!term) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [term, onClose]);

  if (!term || !GLOSSARY[term]) return null;
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 grid place-items-end sm:place-items-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Explanation of ${term}`}
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-xl font-extrabold capitalize">{term}</h2>
          <button ref={closeRef} onClick={onClose} aria-label="Close explanation" className="secondary !p-2">
            <X size={18} />
          </button>
        </div>
        <Eli5Card term={term} />
      </div>
    </div>
  );
}

const TERM_PATTERN = new RegExp(
  `\\b(${[...GLOSSARY_TERMS]
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})\\b`,
  'gi',
);

/** Renders text and turns glossary words into buttons that open the ELI5 dialog. */
export function RichText({ text, onTerm }) {
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(TERM_PATTERN)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <button key={`${m.index}-${m[0]}`} type="button" className="term" onClick={() => onTerm(m[0].toLowerCase())}>
        {m[0]}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
