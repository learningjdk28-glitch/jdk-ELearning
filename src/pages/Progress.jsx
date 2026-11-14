import { Link } from 'react-router-dom';
import { CheckCircle2, ChartColumn } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadMyProgress } from '../services/learn.js';
import { coursePath, moduleSummary } from '../lib/learningPath.js';
import { ProgressBar, moduleLink } from '../components/learn/PathList.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/** Student progress from the database: each course, each module, best quiz scores and the pre-test score. */
export default function Progress() {
  const { data, loading, error, reload } = useLoad(loadMyProgress, []);
  if (loading) return <LoadingState label="Loading your progress..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const { learning, best, pretests } = data;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <header>
        <h1 className="text-3xl font-black text-text flex items-center gap-3"><ChartColumn className="text-brand" aria-hidden="true" /> Progress</h1>
        <p className="text-text-muted mt-1">Pages read, modules finished and your best quiz scores in each course.</p>
      </header>

      {learning.courses.length === 0 ? (
        <EmptyState title="No courses yet" action={<Link className="primary" to="/catalog">Explore courses</Link>}>Enroll in a course to see your progress here.</EmptyState>
      ) : learning.courses.map(({ course, modules, placement }) => {
        const path = coursePath(modules, learning.done, learning.passed, placement);
        const pre = pretests.find((p) => p.course_id === course.id);
        return (
          <section key={course.id} className="panel p-5 sm:p-6" aria-labelledby={`progress-${course.id}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 id={`progress-${course.id}`} className="text-xl font-black text-text">{course.title}</h2>
                <p className="text-sm text-text-muted mt-1">
                  {path.modulesDone} of {path.items.length} modules finished
                  {pre ? ` · pre-test ${Math.round(Number(pre.score))}% on ${new Date(pre.submitted_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              {path.finished
                ? <span className="inline-flex items-center gap-1 font-bold text-success"><CheckCircle2 size={18} aria-hidden="true" /> Complete</span>
                : <Link className="secondary text-sm" to={`/learn/${encodeURIComponent(course.id)}`}>Open course</Link>}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1"><ProgressBar percent={path.percent} label={`${course.title} progress`} /></div>
              <span className="text-sm font-bold text-text tabular-nums">{path.percent}%</span>
            </div>
            {path.items.length > 0 && (
              <ol className="mt-4 divide-y divide-border">
                {path.items.map((item, i) => {
                  const scores = item.module.quizzes.map((q) => best[q.id]).filter((s) => s != null);
                  return (
                    <li key={item.module.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                      <Link to={moduleLink(course.id, item.module.id)} className="min-w-0 font-semibold text-text hover:text-brand">
                        {i + 1}. {item.module.title}
                        <span className="block text-sm font-normal text-text-muted">{moduleSummary(item)}</span>
                      </Link>
                      <span className={`text-sm font-bold tabular-nums ${item.complete ? 'text-success' : 'text-text-muted'}`}>
                        {scores.length ? `Best quiz ${Math.max(...scores)}%` : item.module.quizzes.length ? 'Quiz not taken' : 'No quiz'}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        );
      })}
    </div>
  );
}
