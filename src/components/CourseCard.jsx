import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

/** Purple course card from the design: title, progress bar, chevron. */
export default function CourseCard({ to, eyebrow, title, pct, caption }) {
  const Tag = to.startsWith('#') ? 'a' : Link;
  const props = to.startsWith('#') ? { href: to } : { to };
  return (
    <Tag {...props} className="flex items-center gap-4 rounded-3xl bg-brand text-white p-6 shadow-lg shadow-indigo-200 hover:bg-brand-dark">
      <div className="flex-1 min-w-0">
        <p className="text-indigo-100 text-sm">{eyebrow}</p>
        <h2 className="text-2xl font-extrabold leading-tight mt-1">{title}</h2>
        <div className="flex items-center gap-3 mt-5">
          <div className="flex-1 h-2.5 rounded-full bg-white/25 overflow-hidden" role="progressbar" aria-label={`${title} progress`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-2.5 rounded-full bg-emerald-300" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-bold">{pct}%</span>
        </div>
        <p className="text-indigo-100 text-sm mt-2">{caption}</p>
      </div>
      <span className="w-12 h-12 rounded-full bg-white text-brand grid place-items-center shrink-0">
        <ChevronRight size={26} aria-hidden="true" />
      </span>
    </Tag>
  );
}
