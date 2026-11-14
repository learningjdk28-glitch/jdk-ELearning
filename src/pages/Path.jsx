import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, Lightbulb, Play } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { COMPETENCIES } from '../data/course.js';
import { BackHeader, Callout, CompPill, LevelBadge } from '../components/ui.jsx';

export default function Path() {
  const { path, hasDiagnostic, next } = useLearner();
  const navigate = useNavigate();
  const firstOpenIndex = path.findIndex((p) => !p.completed);

  return (
    <div className="w-full">
      <BackHeader title="My Learning Path" to="/dashboard" />
      <p className="text-slate-600 text-lg mb-5">
        {hasDiagnostic ? 'Your personalized lessons based on your results.' : 'Lessons use the Standard level until you take the pre-test.'}
      </p>
      {!hasDiagnostic && (
        <div className="mb-5">
          <Callout tone="warn">
            <Link to="/pretest" className="underline font-bold">Take the pre-test</Link> to personalize this path.
          </Callout>
        </div>
      )}

      <ol className="relative grid xl:grid-cols-2 xl:gap-x-10 xl:gap-y-4">
        {path.map((item, i) => {
          const focus = i === firstOpenIndex;
          return (
            <li key={item.lesson.id} className="flex gap-4 pb-4 xl:pb-0 last:pb-0 relative">
              {i < path.length - 1 && <span className="absolute left-5 top-12 bottom-0 w-0.5 bg-indigo-200 xl:hidden" aria-hidden="true" />}
              <span
                className={`w-11 h-11 rounded-full grid place-items-center shrink-0 z-10 font-extrabold ${
                  item.completed ? 'bg-green-600 text-white' : focus ? 'bg-brand text-white ring-8 ring-indigo-100' : 'bg-indigo-100 text-brand'
                }`}
                aria-hidden="true"
              >
                {item.completed ? <Check size={22} /> : focus ? <Play size={18} fill="currentColor" /> : i + 1}
              </span>
              <div className={`flex-1 min-w-0 rounded-3xl bg-white p-4 sm:p-5 ${focus ? 'border-2 border-brand' : 'border border-indigo-100'}`}>
                <p className="sr-only">Step {i + 1}</p>
                <h2 className="font-extrabold text-lg leading-snug">Lesson {i + 1}: {item.lesson.title}</h2>
                <p className={`text-sm mt-1 font-semibold ${focus ? 'text-brand' : 'text-slate-600'}`}>
                  {item.completed ? 'Completed' : focus ? 'In Focus' : 'Up next'} &middot; {COMPETENCIES[item.competency].name}
                </p>
                <div className="flex flex-wrap items-center gap-2 mt-3">
                  <LevelBadge level={item.level} />
                  {item.score !== null && <CompPill competency={item.competency} />}
                </div>
                <p className="muted mt-3">{item.reason}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link to={`/lesson/${item.lesson.id}`} className="primary !py-2.5">{item.completed ? 'Review lesson' : 'Open lesson'}</Link>
                  <Link to={`/quiz/${item.lesson.id}`} className="secondary">Take quiz</Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {hasDiagnostic && next && (
        <div className="rounded-3xl bg-brand-soft p-5 mt-5 flex gap-3">
          <Lightbulb className="text-amber-500 shrink-0" size={24} aria-hidden="true" />
          <p>
            <b>{next.lesson.title}</b> is recommended because {COMPETENCIES[next.competency].name}
            {next.score !== null ? ` (${next.score}%)` : ''} is your lowest score among the unfinished lessons. Lessons are ordered by rule, and you can open any of them.
          </p>
        </div>
      )}

      {next && (
        <button className="primary w-full md:w-auto md:min-w-[22rem] text-lg !py-4 mt-6" onClick={() => navigate(`/lesson/${next.lesson.id}`)}>
          Continue Lesson {Math.max(1, path.findIndex((p) => p.lesson.id === next.lesson.id) + 1)}<ArrowRight size={20} />
        </button>
      )}
    </div>
  );
}
