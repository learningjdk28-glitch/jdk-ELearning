import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadMyLearning } from '../services/learn.js';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/** Pre-tests of the student's enrolled courses: take one, or see the result. */
export default function PreTest() {
  const { data, loading, error, reload } = useLoad(loadMyLearning, []);
  if (loading) return <LoadingState label="Loading pre-tests..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const withPretest = data.courses.filter((c) => c.placement.pretest !== 'none');

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-12">
      <header>
        <h1 className="text-3xl font-black text-text">Pre-tests</h1>
        <p className="text-text-muted mt-1">Each course can start with a short pre-test. Your result decides where you begin.</p>
      </header>
      {data.courses.length === 0 ? (
        <EmptyState title="You are not enrolled in a course yet" action={<Link className="primary" to="/catalog"><BookOpen size={16} aria-hidden="true" /> Explore courses</Link>} />
      ) : withPretest.length === 0 ? (
        <EmptyState title="None of your courses has a pre-test">Start any course from its first module.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {withPretest.map(({ course, placement }) => (
            <li key={course.id} className="panel p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-bold text-text">{course.title}</p>
                <p className="text-sm text-text-muted">{placement.pretest === 'done' ? `Taken · ${Math.round(placement.score)}%` : 'Not taken yet'}</p>
              </div>
              <Link className={placement.pretest === 'done' ? 'secondary' : 'primary'} to={`/learn/${encodeURIComponent(course.id)}/pretest`}>
                {placement.pretest === 'done' ? 'See result' : 'Take the pre-test'} <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
