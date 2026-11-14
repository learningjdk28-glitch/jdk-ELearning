import { Link, Navigate } from 'react-router-dom';
import { BookOpen, ChartColumn, ChevronRight, ClipboardList, Settings, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { COURSE } from '../data/course.js';
import { LESSONS } from '../data/lessons.js';
import { CompetencyBars, LevelBadge } from '../components/ui.jsx';
import CourseCard from '../components/CourseCard.jsx';
import { loadCourse } from '../lib/courseContent.js';

function MiniLaptop() {
  return (
    <div className="relative w-28 shrink-0 hidden sm:block" aria-hidden="true">
      <div className="rounded-xl bg-indigo-300/60 p-1.5">
        <div className="rounded-lg bg-white p-1.5">
          <div className="h-1.5 w-2/3 rounded bg-brand mb-1" />
          <div className="flex items-end gap-1">
            <div className="w-3 h-5 rounded-sm bg-green-500" />
            <div className="w-3 h-3 rounded-sm bg-blue-500" />
            <div className="ml-auto w-5 h-5 rounded-full bg-indigo-100" />
          </div>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-indigo-300/70 mt-1 mx-[-6px]" />
    </div>
  );
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const { completedIds, completedModuleIds, hasDiagnostic, next, stats, sync, online } = useLearner();
  let nb = null;
  try {
    nb = loadCourse('networking-basics');
  } catch {
    nb = null;
  }
  const nbDone = nb ? nb.modules.filter((m) => completedModuleIds.includes(m.id)).length : 0;
  const done = completedIds.length;
  const pct = Math.round((done / LESSONS.length) * 100);
  const name = user?.name || user?.email?.split('@')[0] || 'Learner';
  const courseTarget = !hasDiagnostic ? '/modes' : next ? `/lesson/${next.lesson.id}` : '/progress';

  const actions = [
    [ClipboardList, 'bg-indigo-100 text-brand', hasDiagnostic ? 'Retake Pre-Test' : 'Take Pre-Test', 'Know your starting level', '/pretest'],
    [BookOpen, 'bg-indigo-100 text-brand', 'My Lessons', 'Continue your adaptive learning', '/path'],
    [ChartColumn, 'bg-amber-100 text-amber-700', 'My Progress', 'Track your growth and competencies', '/progress'],
    [null, 'bg-indigo-100 text-brand', 'Glossary (ELI5)', 'Understand terms in simple words', '/glossary'],
  ];

  if (isAdmin) return <Navigate to="/admin" replace />;

  return (
    <>
      <div className="flex items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Hi, {name}!</h1>
          <p className="text-slate-600 mt-1 text-lg">Ready to continue your learning?</p>
        </div>
        <Link to="/profile" aria-label="Profile and settings" className="hidden md:grid w-12 h-12 place-items-center rounded-2xl bg-white border border-indigo-100">
          <Settings size={22} />
        </Link>
      </div>

      <div
        className={`rounded-3xl border p-4 flex items-center gap-4 mb-5 ${online ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}
        role="status"
      >
        <div className={`w-14 h-14 rounded-full grid place-items-center text-white shrink-0 ${online ? 'bg-green-600' : 'bg-amber-500'}`}>
          {online ? <Wifi size={26} aria-hidden="true" /> : <WifiOff size={26} aria-hidden="true" />}
        </div>
        <div>
          <p className={`font-extrabold text-lg ${online ? 'text-green-900' : 'text-amber-900'}`}>{online ? 'Online' : 'Offline Mode'}</p>
          <p className={`text-sm ${online ? 'text-green-800' : 'text-amber-900'}`}>
            {online
              ? 'Everything is also saved on this device.'
              : sync.pending > 0
                ? `All learning features work. ${sync.pending} change(s) will sync when you reconnect.`
                : 'All learning features are available.'}
          </p>
        </div>
      </div>

      <Link
        to={courseTarget}
        className="flex items-center gap-4 rounded-3xl bg-brand text-white p-6 mb-5 shadow-lg shadow-indigo-200 hover:bg-brand-dark"
      >
        <div className="flex-1 min-w-0">
          <p className="text-indigo-100 text-sm">{!hasDiagnostic ? 'Start here' : next ? 'Continue' : 'Course complete'}</p>
          <h2 className="text-2xl font-extrabold leading-tight mt-1">{COURSE.title}</h2>
          <div className="flex items-center gap-3 mt-5">
            <div
              className="flex-1 h-2.5 rounded-full bg-white/25 overflow-hidden"
              role="progressbar"
              aria-label="Course progress"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-2.5 rounded-full bg-emerald-300" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-bold">{pct}%</span>
          </div>
          <p className="text-indigo-100 text-sm mt-2">{done} of {LESSONS.length} lessons completed</p>
        </div>
        <MiniLaptop />
        <span className="w-12 h-12 rounded-full bg-white text-brand grid place-items-center shrink-0">
          <ChevronRight size={26} aria-hidden="true" />
        </span>
      </Link>

      {nb && (
        <div className="mb-5">
          <CourseCard to="/course/networking-basics" eyebrow="Course" title={nb.title} pct={Math.round((nbDone / nb.modules.length) * 100)} caption={`${nbDone} of ${nb.modules.length} modules completed`} />
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {actions.map(([Icon, tile, title, desc, to]) => (
          <Link key={to} to={to} className="panel p-5 hover:border-indigo-400">
            <div className={`tile ${tile}`}>
              {Icon ? <Icon size={24} aria-hidden="true" /> : <span className="font-extrabold text-lg" aria-hidden="true">Aa</span>}
            </div>
            <h3 className="font-extrabold text-lg mt-4 leading-tight">{title}</h3>
            <p className="muted mt-1">{desc}</p>
          </Link>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <CompetencyBars stats={stats} title="Your competencies" compact />
        <div className="panel p-6">
          <h2 className="font-bold text-lg">Recommended next lesson</h2>
          {next && hasDiagnostic ? (
            <>
              <p className="mt-3 font-extrabold text-xl">{next.lesson.title}</p>
              <div className="mt-2"><LevelBadge level={next.level} /></div>
              <p className="muted mt-3">{next.reason}</p>
              <Link to={`/lesson/${next.lesson.id}`} className="primary mt-4">Open lesson</Link>
            </>
          ) : (
            <p className="muted mt-3">
              {hasDiagnostic ? 'You have completed every lesson.' : 'Complete the pre-test to receive a recommendation that matches your results.'}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
