import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, GraduationCap, Layers, Sun } from 'lucide-react';
import { COMPETENCIES, LEVEL_LABELS } from '../data/course.js';

// One color and icon per competency, used on every screen so they are recognizable.
export const COMP_STYLE = [
  { Icon: GraduationCap, tile: 'bg-green-100 text-green-700', bar: 'bg-green-500', pill: 'bg-green-100 text-green-800' },
  { Icon: Layers, tile: 'bg-blue-100 text-blue-700', bar: 'bg-blue-500', pill: 'bg-blue-100 text-blue-800' },
  { Icon: Sun, tile: 'bg-amber-100 text-amber-700', bar: 'bg-amber-500', pill: 'bg-amber-100 text-amber-800' },
  { Icon: Brain, tile: 'bg-violet-100 text-violet-700', bar: 'bg-violet-500', pill: 'bg-violet-100 text-violet-800' },
];

export function CompPill({ competency }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${COMP_STYLE[competency].pill}`}>
      {COMPETENCIES[competency].name}
    </span>
  );
}

export function Heading({ title, desc, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">{title}</h1>
        {desc && <p className="text-slate-600 mt-2 max-w-2xl">{desc}</p>}
      </div>
      {children}
    </div>
  );
}

/** Mobile-style page header: back arrow, centered title, optional right slot. */
export function BackHeader({ title, to, right }) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 mb-5">
      <button
        onClick={() => (to ? navigate(to) : navigate(-1))}
        aria-label="Go back"
        className="w-10 h-10 grid place-items-center rounded-full hover:bg-indigo-100"
      >
        <ArrowLeft size={22} />
      </button>
      <h1 className="text-xl sm:text-2xl font-extrabold flex-1 min-w-0 truncate">{title}</h1>
      {right}
    </div>
  );
}

const LEVEL_STYLES = {
  foundational: 'bg-red-100 text-red-800',
  standard: 'bg-sky-100 text-sky-900',
  advanced: 'bg-emerald-100 text-emerald-900',
};

export function LevelBadge({ level }) {
  return (
    <span className={`inline-block rounded-full px-3 py-1 text-xs font-bold ${LEVEL_STYLES[level]}`}>
      Level: {LEVEL_LABELS[level]}
    </span>
  );
}

export function Callout({ tone = 'info', children }) {
  const tones = {
    info: 'bg-indigo-50 text-indigo-900 border-indigo-200',
    warn: 'bg-amber-50 text-amber-900 border-amber-200',
    good: 'bg-green-50 text-green-900 border-green-200',
    bad: 'bg-red-50 text-red-900 border-red-200',
  };
  return (
    <div role={tone === 'bad' ? 'alert' : 'status'} className={`rounded-2xl border p-4 text-sm ${tones[tone]}`}>
      {children}
    </div>
  );
}

export function FullScreenMessage({ children }) {
  return (
    <div className="min-h-screen grid place-items-center p-8 text-center text-slate-600" role="status">
      {children}
    </div>
  );
}

/** Four competency rows: icon tile, name, percent, colored bar. Never hides missing evidence. */
export function CompetencyBars({ stats, title, compact = false }) {
  return (
    <div className="panel p-5 sm:p-6">
      {title && <h2 className="font-bold text-lg mb-4">{title}</h2>}
      <div className={compact ? 'space-y-4' : 'divide-y divide-indigo-50'}>
        {stats.map((s) => {
          const st = COMP_STYLE[s.competency];
          const Icon = st.Icon;
          return (
            <div key={s.competency} className={`flex gap-4 items-start ${compact ? '' : 'py-4 first:pt-0 last:pb-0'}`}>
              {!compact && (
                <div className={`tile ${st.tile}`}>
                  <Icon size={24} aria-hidden="true" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex justify-between gap-2">
                  <span className="font-bold">{COMPETENCIES[s.competency].name}</span>
                  <span className="font-extrabold tabular-nums">{s.score === null ? 'Not assessed' : `${s.score}%`}</span>
                </div>
                <div
                  className="bg-indigo-50 h-2.5 rounded-full overflow-hidden mt-2"
                  role="progressbar"
                  aria-label={COMPETENCIES[s.competency].name}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={s.score ?? 0}
                >
                  <div className={`h-2.5 rounded-full ${st.bar}`} style={{ width: `${s.score ?? 0}%` }} />
                </div>
                <p className="muted mt-1">
                  {s.answered === 0 ? 'No answers yet.' : `${s.correct} of ${s.answered} answered correctly.`}
                  {s.answered > 0 && !s.sufficient && (
                    <span className="text-amber-800 font-semibold"> Insufficient evidence: take more questions.</span>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
