import { Link } from 'react-router-dom';
import { useLearner } from '../context/LearnerContext.jsx';
import { loadCourse } from '../lib/courseContent.js';
import { attemptsForModule, courseProfile, latestForModule, moduleSummary } from '../lib/modules.js';
import { COMPETENCIES } from '../data/course.js';
import { Callout, CompetencyBars } from './ui.jsx';

/** Progress for a file-based course. Module quizzes are kept apart from the Digital Literacy pre-test. */
export default function NetworkingProgress({ courseId = 'networking-basics' }) {
  const { moduleAttempts, completedModuleIds } = useLearner();
  let course;
  try {
    course = loadCourse(courseId);
  } catch (e) {
    return <Callout tone="bad">This course could not be loaded: {e.message}</Callout>;
  }
  const ids = course.modules.map((m) => m.id);
  const profile = courseProfile(moduleAttempts, ids);
  const titleOf = Object.fromEntries(course.modules.map((m) => [m.id, m.title]));
  const ordered = [...moduleAttempts].reverse();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="panel p-4"><p className="muted">Modules done</p><p className="font-extrabold text-2xl">{completedModuleIds.length}/{ids.length}</p></div>
        <div className="panel p-4"><p className="muted">Quiz attempts</p><p className="font-extrabold text-2xl">{moduleAttempts.length}</p></div>
        <div className="panel p-4"><p className="muted">Questions</p><p className="font-extrabold text-2xl">{ids.length * 12}</p></div>
      </div>

      {moduleAttempts.length === 0 ? (
        <Callout tone="warn">No module quizzes yet. <Link className="underline font-bold" to={`/course/${courseId}`}>Open the course</Link> to start.</Callout>
      ) : (
        <>
          <CompetencyBars stats={profile} title="Competencies: latest quiz of each module combined" />
          <p className="muted">Each module quiz has three questions per competency, so scores are a small sample. This view uses the latest attempt of each module; every earlier attempt stays in the history below. Digital Literacy pre-test results are shown separately.</p>
        </>
      )}

      <div className="space-y-3">
        {course.modules.map((m, i) => {
          const latest = latestForModule(moduleAttempts, m.id);
          const count = attemptsForModule(moduleAttempts, m.id).length;
          const s = latest ? moduleSummary(latest.responses) : null;
          return (
            <div key={m.id} className="panel p-4 sm:p-5">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="font-extrabold">Module {i + 1}: {m.title}</p>
                <p className="font-extrabold tabular-nums">{s ? `${s.correct}/${s.outOf}` : 'Not taken'}</p>
              </div>
              {s && (
                <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-3 text-sm">
                  {s.byCompetency.map((c) => (
                    <li key={c.competency} className="flex justify-between gap-2"><span>{COMPETENCIES[c.competency].short}</span><span className="font-bold tabular-nums">{c.answered === 0 ? 'Not assessed' : `${c.correct} of ${c.outOf}`}</span></li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3 mt-3">
                <Link className="secondary" to={`/course/${courseId}/${m.id}`}>Lesson</Link>
                {latest && <Link className="secondary" to={`/course/${courseId}/${m.id}/results/${latest.id}`}>Latest results ({count} attempt{count === 1 ? '' : 's'})</Link>}
                <Link className="secondary" to={`/course/${courseId}/${m.id}/quiz`}>{latest ? 'Retake' : 'Take quiz'}</Link>
              </div>
            </div>
          );
        })}
      </div>

      <section className="panel p-5 sm:p-6" aria-labelledby="nbh">
        <h2 id="nbh" className="font-extrabold text-lg">Module quiz history</h2>
        {ordered.length === 0 ? (
          <p className="muted mt-3">Nothing yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-indigo-50">
            {ordered.map((a) => {
              const s = moduleSummary(a.responses);
              return (
                <li key={a.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold">Module quiz: {titleOf[a.lessonId] || a.lessonId}</p>
                    <p className="muted">{new Date(a.createdAt).toLocaleString()} &middot; {s.correct}/{s.outOf} correct</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold ${a.synced ? 'text-green-800' : 'text-amber-800'}`}>{a.synced ? 'Synced' : 'Waiting to sync'}</span>
                    <Link className="text-brand underline font-semibold" to={`/course/${courseId}/${a.lessonId}/results/${a.id}`}>Review</Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
