import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BookOpen, ChartColumn, ClipboardList, Lightbulb, Route as RouteIcon, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import useLoad from '../hooks/useLoad.js';
import { loadMyLearning } from '../services/learn.js';
import { coursePath } from '../lib/learningPath.js';
import { ProgressBar, continueLink } from '../components/learn/PathList.jsx';
import { ErrorState, LoadingState } from '../components/learn/States.jsx';

const QUICK = [
  ['/path', 'My Path', 'Where you are and what is next', RouteIcon],
  ['/glossary', 'Glossary', 'Terms in plain words', Lightbulb],
  ['/progress', 'My progress', 'Scores and growth', ChartColumn],
  ['/pretest', 'Pre-test', 'Find your starting point', ClipboardList],
];

/** Student home: continue where you left off, your courses, and shortcuts. Every course comes from the database. */
export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  if (isAdmin) return <Navigate to="/admin" replace />;
  const name = user?.name || user?.email?.split('@')[0] || 'there';
  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-8">
      <header>
        <h1 className="text-3xl sm:text-4xl font-black text-text">Hi, {name}!</h1>
        <p className="text-text-muted mt-1 text-lg">Ready to keep learning?</p>
      </header>
      <ConnectionStrip />
      <MyLearning />
      <nav aria-label="Shortcuts" className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {QUICK.map(([to, title, desc, Icon]) => (
          <Link key={to} to={to} className="panel p-5 hover:border-brand/40">
            <span className="tile bg-brand-soft text-brand"><Icon size={24} aria-hidden="true" /></span>
            <span className="block font-extrabold text-lg text-text mt-4 leading-tight">{title}</span>
            <span className="block muted mt-1">{desc}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}

function ConnectionStrip() {
  const { online, sync } = useLearner();
  return (
    <div role="status" className={`rounded-2xl border p-4 flex items-center gap-3 ${online ? 'bg-success/10 border-success/30' : 'bg-warning/10 border-warning/30'}`}>
      {online ? <Wifi size={22} className="text-success shrink-0" aria-hidden="true" /> : <WifiOff size={22} className="text-warning shrink-0" aria-hidden="true" />}
      <p className="text-text">
        <span className="font-bold">{online ? 'Online.' : 'Offline.'}</span>{' '}
        {online ? 'Your progress is saved to your account.' : sync.pending > 0 ? `${sync.pending} change(s) will sync when you reconnect.` : 'Online courses need internet. Offline lessons still work.'}
      </p>
    </div>
  );
}

function MyLearning() {
  const { data, loading, error, reload } = useLoad(loadMyLearning, []);
  if (loading) return <LoadingState label="Loading your courses..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const courses = data.courses.map((c) => ({ ...c, path: coursePath(c.modules, data.done, data.passed) }));
  const active = courses.find((c) => c.path.continue && c.path.percent > 0) || courses.find((c) => c.path.continue);

  if (courses.length === 0) {
    return (
      <Link to="/catalog" className="flex items-center gap-4 rounded-3xl bg-brand text-brand-contrast p-6 shadow-lg shadow-brand/20 hover:bg-brand-strong">
        <span className="flex-1 min-w-0">
          <span className="block text-sm opacity-90">Start here</span>
          <span className="block text-2xl font-extrabold mt-1">Choose your first course</span>
          <span className="block mt-2 opacity-90">{data.catalog.length} course{data.catalog.length === 1 ? '' : 's'} available</span>
        </span>
        <span className="w-12 h-12 rounded-full bg-surface-raised text-brand grid place-items-center shrink-0"><ArrowRight size={24} aria-hidden="true" /></span>
      </Link>
    );
  }

  return (
    <>
      {active && <ContinueCard course={active.course} path={active.path} />}
      <section aria-labelledby="my-courses">
        <div className="flex items-end justify-between gap-3 mb-3">
          <h2 id="my-courses" className="text-xl font-black text-text">My courses</h2>
          {data.catalog.length > 0 && <Link to="/catalog" className="text-sm font-semibold text-brand underline">{data.catalog.length} more to explore</Link>}
        </div>
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {courses.map(({ course, path }) => (
            <li key={course.id}>
              <Link to={`/learn/${encodeURIComponent(course.id)}`} className="panel p-5 block h-full hover:border-brand/40">
                <span className="flex items-start gap-3">
                  <span className="tile bg-brand-soft text-brand"><BookOpen size={22} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block font-extrabold text-text leading-tight">{course.title}</span>
                    <span className="block text-sm text-text-muted mt-1">{path.finished ? 'Complete' : `${path.modulesDone} of ${path.items.length} modules done`}</span>
                  </span>
                </span>
                <span className="block mt-4"><ProgressBar percent={path.percent} label={`${course.title}: ${path.percent}%`} /></span>
                <span className="block text-right text-sm font-bold text-text mt-1">{path.percent}%</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function ContinueCard({ course, path }) {
  const c = path.continue;
  const where = c.kind === 'quiz' ? 'Quiz next' : `Page ${c.page + 1}`;
  return (
    <Link to={continueLink(course.id, path)} className="flex items-center gap-4 rounded-3xl bg-brand text-brand-contrast p-6 shadow-lg shadow-brand/20 hover:bg-brand-strong">
      <span className="flex-1 min-w-0">
        <span className="block text-sm opacity-90">{path.percent === 0 ? 'Start' : 'Continue'} · {course.title}</span>
        <span className="block text-2xl font-extrabold leading-tight mt-1">{c.title}</span>
        <span className="block mt-1 opacity-90">{where}</span>
        <span className="mt-4 flex items-center gap-3">
          <span className="flex-1 h-2.5 rounded-full bg-brand-contrast/25 overflow-hidden" role="progressbar" aria-label="Course progress" aria-valuenow={path.percent} aria-valuemin={0} aria-valuemax={100}>
            <span className="block h-full rounded-full bg-brand-contrast" style={{ width: `${path.percent}%` }} />
          </span>
          <span className="font-bold">{path.percent}%</span>
        </span>
      </span>
      <span className="w-12 h-12 rounded-full bg-surface-raised text-brand grid place-items-center shrink-0"><ArrowRight size={24} aria-hidden="true" /></span>
    </Link>
  );
}
