import { Link } from 'react-router-dom';
import { CalendarClock, ChevronRight } from 'lucide-react';
import { dueLabel, submissionStatus } from '../../lib/submissionRules.js';
import useLoad from '../../hooks/useLoad.js';
import { listCourseAssignments } from '../../services/assignments.js';
import { ErrorState, LoadingState } from './States.jsx';

const TONE = {
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-surface-muted text-text-muted',
};

export function StatusBadge({ status }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${TONE[status.tone]}`}>{status.label}</span>;
}

export const formatDue = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Assignments with deadline and the student's status. */
export default function AssignmentList({ courseId, assignments }) {
  return (
    <ul className="space-y-2">
      {assignments.map((a) => {
        const status = submissionStatus(a, a.submission);
        return (
          <li key={a.id}>
            <Link to={`/learn/${encodeURIComponent(courseId)}/assignment/${a.id}`} className="panel p-4 flex items-center gap-3 hover:border-brand/40">
              <CalendarClock size={22} className="text-brand shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-text">{a.title}</span>
                <span className="block text-sm text-text-muted">{formatDue(a.due_at)} · {dueLabel(a.due_at)}</span>
              </span>
              <StatusBadge status={status} />
              <ChevronRight size={18} className="text-text-muted shrink-0" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Published assignments of the course, with deadlines and this student's status. */
export function CourseAssignments({ courseId, moduleId = null, title = 'Assignments' }) {
  const { data, loading, error, reload } = useLoad(() => listCourseAssignments(courseId), [courseId]);
  if (loading) return <LoadingState label="Loading assignments..." />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const list = moduleId ? data.filter((a) => a.module_id === moduleId) : data;
  if (list.length === 0) return null;
  return (
    <section aria-labelledby={`assignments-${moduleId || 'course'}`}>
      <h2 id={`assignments-${moduleId || 'course'}`} className="text-xl font-black text-text mb-3">{title}</h2>
      <AssignmentList courseId={courseId} assignments={list} />
    </section>
  );
}
