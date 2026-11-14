import { RichText } from './Eli5.jsx';
import { parseBlocks } from '../lib/markdownBlocks.js';

// Renders a small, safe Markdown subset as React elements: paragraphs, "- " lists, "### " headings,
// **bold**, *italic* and `code`. HTML is never interpreted, so lesson files cannot inject markup or scripts.
// Glossary words are highlighted through RichText and open the ELI5 dialog.

function Inline({ text, onTerm }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).filter((p) => p !== '');
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('`') && p.endsWith('`')) return <code key={i} className="bg-indigo-50 rounded px-1">{p.slice(1, -1)}</code>;
        if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={i}>{p.slice(1, -1)}</em>;
        return <RichText key={i} text={p} onTerm={onTerm} />;
      })}
    </>
  );
}

export default function Markdown({ text, onTerm }) {
  return (
    <div className="space-y-4 text-lg leading-8">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'h3') return <h3 key={i} className="font-extrabold text-xl">{b.text}</h3>;
        if (b.type === 'ul') {
          return (
            <ul key={i} className="list-disc pl-6 space-y-1">
              {b.items.map((it, j) => <li key={j}><Inline text={it} onTerm={onTerm} /></li>)}
            </ul>
          );
        }
        return <p key={i}><Inline text={b.text} onTerm={onTerm} /></p>;
      })}
    </div>
  );
}
