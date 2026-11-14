import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, Circle, MapPin } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadMyLearning } from '../services/learn.js';
import { coursePath } from '../lib/learningPath.js';
import PathList, { ProgressBar, continueLink } from '../components/learn/PathList.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/** My Path: for every enrolled course, what is done, where you are, and what comes next. */
export default function Path() {
  const { data, loading, error, reload } = useLoad(loadMyLearning, []);
  if (loading) return <LoadingState label="Loading your path..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const courses = data.courses
    .map((c) => ({ ...c, path: coursePath(c.modules, data.done, data.passed, c.placement) }))
    // Courses in progress first, then not started, then finished.
    .sort((a, b) => rank(a.path) - rank(b.path));

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-3xl font-black text-text">My Path</h1>
        <p className="text-text-muted mt-1">Where you are in each course, and what to do next.</p>
        <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-text-muted" aria-label="What the markers mean">
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-success text-brand-contrast grid place-items-center" aria-hidden="true"><Check size={12} /></span> Done</li>
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full bg-brand text-brand-contrast grid place-items-center" aria-hidden="true"><MapPin size={12} /></span> You are here</li>
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full border-2 border-brand text-brand grid place-items-center" aria-hidden="true"><Circle size={8} /></span> Up next</li>
          <li className="flex items-center gap-2"><span className="w-5 h-5 rounded-full border-2 border-border" aria-hidden="true" /> Later</li>
        </ul>
      </header>

      {courses.length === 0 ? (
        <EmptyState title="You are not enrolled in a course yet" action={<Link className="primary" to="/catalog"><BookOpen size={16} aria-hidden="true" /> Explore courses</Link>}>
          Enroll in a course and your path appears here.
        </EmptyState>
      ) : courses.map(({ course, path }) => (
        <section key={course.id} className="panel p-5 sm:p-6" aria-labelledby={`path-${course.id}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id={`path-${course.id}`} className="text-xl font-black text-text">{course.title}</h2>
              <p className="text-sm text-text-muted mt-1">{path.finished ? 'Course complete' : `${path.modulesDone} of ${path.items.length} modules done`}</p>
            </div>
            {path.continue && <Link className="primary" to={continueLink(course.id, path)}>{path.percent === 0 ? 'Start' : 'Continue'} <ArrowRight size={16} aria-hidden="true" /></Link>}
          </div>
          <div className="mt-4"><ProgressBar percent={path.percent} label={`${course.title}: ${path.percent}% complete`} /></div>
          <div className="mt-6">
            {path.items.length === 0 ? <p className="text-text-muted">No modules published yet.</p> : <PathList courseId={course.id} path={path} />}
          </div>
        </section>
      ))}
    </div>
  );
}

const rank = (path) => (path.finished ? 2 : path.percent > 0 ? 0 : 1);
