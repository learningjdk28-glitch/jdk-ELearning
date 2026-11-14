import { Link } from 'react-router-dom';
import { ArrowRight, Check, Circle, MapPin } from 'lucide-react';
import { moduleSummary } from '../../lib/learningPath.js';

const STATUS = {
  done: { label: 'Done', Icon: Check, dot: 'bg-success text-brand-contrast', text: 'text-success' },
  current: { label: 'You are here', Icon: MapPin, dot: 'bg-brand text-brand-contrast', text: 'text-brand' },
  next: { label: 'Up next', Icon: Circle, dot: 'bg-surface-raised border-2 border-brand text-brand', text: 'text-text' },
  later: { label: 'Later', Icon: Circle, dot: 'bg-surface-raised border-2 border-border text-text-muted', text: 'text-text-muted' },
};

export function ProgressBar({ percent, label }) {
  return (
    <div className="h-2.5 rounded-full bg-surface-muted overflow-hidden" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
    </div>
  );
}

export const moduleLink = (courseId, moduleId, page) =>
  `/learn/${encodeURIComponent(courseId)}/module/${moduleId}${page != null ? `?page=${page + 1}` : ''}`;

/** Where "Continue" goes for a course path. */
export function continueLink(courseId, path) {
  const c = path.continue;
  if (!c) return null;
  if (c.kind === 'quiz' && c.quizId) return `/learn/${encodeURIComponent(courseId)}/quiz/${c.quizId}`;
  return moduleLink(courseId, c.moduleId, c.page);
}

/** Vertical timeline of a course's modules: done, you are here, up next, later. */
export default function PathList({ courseId, path }) {
  return (
    <ol className="relative">
      {path.items.map((item, i) => {
        const s = STATUS[item.status];
        const last = i === path.items.length - 1;
        return (
          <li key={item.module.id} className="relative flex gap-4 pb-5 last:pb-0">
            {!last && <span className={`absolute left-[19px] top-10 bottom-0 w-0.5 ${item.status === 'done' ? 'bg-success' : 'bg-border'}`} aria-hidden="true" />}
            <span className={`relative z-10 w-10 h-10 shrink-0 rounded-full grid place-items-center ${s.dot}`} aria-hidden="true"><s.Icon size={18} /></span>
            <div className={`min-w-0 flex-1 rounded-2xl p-4 ${item.status === 'current' ? 'bg-brand-soft border border-brand/30' : 'bg-surface-raised border border-border'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>Module {i + 1} · {s.label}</p>
              <Link to={moduleLink(courseId, item.module.id, item.status === 'current' && item.nextPage >= 0 ? item.nextPage : null)} className="block font-bold text-text hover:text-brand mt-1">
                {item.module.title}
              </Link>
              <p className="text-sm text-text-muted mt-1">{moduleSummary(item)}</p>
              {item.status === 'current' && (
                <Link to={continueLink(courseId, path)} className="primary mt-3 text-sm">
                  {path.continue.kind === 'quiz' ? 'Take the quiz' : item.pagesDone === 0 ? 'Start' : 'Continue'} <ArrowRight size={16} aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
