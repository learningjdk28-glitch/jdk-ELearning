import { Link } from 'react-router-dom';
import { ArrowRight, Check, CheckCheck, Circle, MapPin } from 'lucide-react';
import { moduleSummary } from '../../lib/learningPath.js';

const STATUS = {
  done: { label: 'Done', Icon: Check, dot: 'bg-success text-brand-contrast', text: 'text-success' },
  'tested-out': { label: 'Tested out', Icon: CheckCheck, dot: 'bg-success/10 border-2 border-success text-success', text: 'text-success' },
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
  if (c.kind === 'pretest') return `/learn/${encodeURIComponent(courseId)}/pretest`;
  if (c.kind === 'quiz' && c.quizId) return `/learn/${encodeURIComponent(courseId)}/quiz/${c.quizId}`;
  return moduleLink(courseId, c.moduleId, c.page);
}

/** Vertical timeline of a course's modules: done, you are here, up next, later. */
export default function PathList({ courseId, path }) {
  return (
    <ol className="relative">
      {path.pretest !== 'none' && <PretestStep courseId={courseId} state={path.pretest} />}
      {path.items.map((item, i) => {
        const s = STATUS[item.status];
        const last = i === path.items.length - 1;
        return (
          <li key={item.module.id} className="relative flex gap-4 pb-5 last:pb-0">
            {!last && <span className={`absolute left-[19px] top-10 bottom-0 w-0.5 ${item.finishedLike ? 'bg-success' : 'bg-border'}`} aria-hidden="true" />}
            <span className={`relative z-10 w-10 h-10 shrink-0 rounded-full grid place-items-center ${s.dot}`} aria-hidden="true"><s.Icon size={18} /></span>
            <div className={`min-w-0 flex-1 rounded-2xl p-4 ${item.status === 'current' ? 'bg-brand-soft border border-brand/30' : 'bg-surface-raised border border-border'}`}>
              <p className={`text-xs font-bold uppercase tracking-wider ${s.text}`}>Module {i + 1} · {s.label}</p>
              <Link to={moduleLink(courseId, item.module.id, item.status === 'current' && item.nextPage >= 0 ? item.nextPage : null)} className="block font-bold text-text hover:text-brand mt-1">
                {item.module.title}
              </Link>
              <p className="text-sm text-text-muted mt-1">{moduleSummary(item)}</p>
              {item.status === 'current' && path.continue.kind !== 'pretest' && (
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

/** First step of a course that has a pre-test. */
function PretestStep({ courseId, state }) {
  const done = state === 'done';
  return (
    <li className="relative flex gap-4 pb-5">
      <span className={`absolute left-[19px] top-10 bottom-0 w-0.5 ${done ? 'bg-success' : 'bg-border'}`} aria-hidden="true" />
      <span className={`relative z-10 w-10 h-10 shrink-0 rounded-full grid place-items-center ${done ? 'bg-success' : 'bg-brand'} text-brand-contrast`} aria-hidden="true">
        {done ? <Check size={18} /> : <MapPin size={18} />}
      </span>
      <div className={`min-w-0 flex-1 rounded-2xl p-4 ${done ? 'bg-surface-raised border border-border' : 'bg-brand-soft border border-brand/30'}`}>
        <p className={`text-xs font-bold uppercase tracking-wider ${done ? 'text-success' : 'text-brand'}`}>Pre-test · {done ? 'Done' : state === 'pending' ? 'Waiting to sync' : 'Start here'}</p>
        <p className="font-bold text-text mt-1">Find your starting point</p>
        <p className="text-sm text-text-muted mt-1">
          {done ? 'Your result set where you start. You can retake it any time.'
            : state === 'pending' ? 'Submitted — will be scored when you reconnect.'
            : 'A short check of what you already know. Your result decides where you begin.'}
        </p>
        <Link to={`/learn/${encodeURIComponent(courseId)}/pretest`} className={`${done ? 'secondary' : 'primary'} mt-3 text-sm`}>
          {done ? 'See result or retake' : 'Take the pre-test'} <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </li>
  );
}
