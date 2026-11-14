import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BookOpen, CheckCircle2, Lightbulb } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import { loadMyLearning } from '../services/learn.js';
import { enrollMe } from '../services/lms.js';
import { coursePath } from '../lib/learningPath.js';
import { MODULE_PAGE_COUNT } from '../lib/courseRules.js';
import PathList, { ProgressBar, continueLink } from '../components/learn/PathList.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';
import { CourseAssignments } from '../components/learn/AssignmentList.jsx';

/** Course home: enroll, see where you are, continue. */
export default function CourseViewer() {
  const { courseId } = useParams();
  const { data, loading, error, reload } = useLoad(loadMyLearning, []);
  const [busy, setBusy] = useState(false);
  const [enrollError, setEnrollError] = useState('');

  if (loading) return <LoadingState label="Loading course..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const mine = data.courses.find((c) => c.course.id === courseId);
  const course = mine?.course || data.catalog.find((c) => c.id === courseId);
  const back = <Link to="/catalog" className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> All courses</Link>;
  if (!course) return <div className="space-y-4">{back}<EmptyState title="Course not found">It may be unpublished or removed.</EmptyState></div>;

  async function enroll() {
    setBusy(true); setEnrollError('');
    try { await enrollMe(courseId); await reload(); } catch (e) { setEnrollError(e.message); } finally { setBusy(false); }
  }

  const path = mine ? coursePath(mine.modules, data.done, data.passed, mine.placement) : null;
  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {back}
      <header className="panel p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-brand">{course.category || 'Course'} · {course.level || 'All levels'}</p>
        <h1 className="text-3xl font-black text-text mt-2">{course.title}</h1>
        {course.description && <p className="text-text-muted mt-3 max-w-2xl">{course.description}</p>}
        {path && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-sm font-semibold text-text"><span>{path.modulesDone} of {path.items.length} modules done</span><span>{path.percent}%</span></div>
            <ProgressBar percent={path.percent} label={`${course.title} progress`} />
            <div className="flex flex-wrap gap-3 pt-3">
              {path.continue && <Link className="primary" to={continueLink(courseId, path)}>{path.continue.kind === 'pretest' ? 'Take the pre-test' : path.percent === 0 ? 'Start the course' : 'Continue'} <ArrowRight size={16} aria-hidden="true" /></Link>}
              {path.finished && <span className="inline-flex items-center gap-2 font-bold text-success"><CheckCircle2 size={18} aria-hidden="true" /> Course complete</span>}
              <Link className="secondary" to={`/glossary?course=${encodeURIComponent(courseId)}`}><Lightbulb size={16} aria-hidden="true" /> Glossary</Link>
            </div>
          </div>
        )}
      </header>

      {!mine ? (
        <section className="panel p-8 text-center">
          <BookOpen className="mx-auto text-brand mb-3" size={36} aria-hidden="true" />
          <h2 className="text-xl font-black text-text">Enroll to start this course</h2>
          <p className="text-text-muted mt-2">Each module has {MODULE_PAGE_COUNT} short pages and a quick check.</p>
          {enrollError && <p role="alert" className="mt-3 text-danger">{enrollError}</p>}
          <button className="primary mt-5" disabled={busy} onClick={enroll}>{busy ? 'Enrolling...' : 'Enroll for free'}</button>
        </section>
      ) : path.items.length === 0 ? (
        <EmptyState title="No modules yet">Your instructor has not published any modules in this course yet.</EmptyState>
      ) : (
        <>
        <CourseAssignments courseId={courseId} />
        <section aria-labelledby="path-heading">
          <h2 id="path-heading" className="text-xl font-black text-text mb-4">Your path</h2>
          <PathList courseId={courseId} path={path} />
        </section>
        </>
      )}
    </div>
  );
}

