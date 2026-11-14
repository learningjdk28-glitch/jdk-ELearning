import { Link, useParams } from 'react-router-dom';
import { ArrowRight, Check, Play } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { loadCourse } from '../lib/courseContent.js';
import { courseProfile, latestForModule, moduleSummary } from '../lib/modules.js';
import { BackHeader, Callout, CompetencyBars } from '../components/ui.jsx';

export default function CourseModules() {
  const { courseId } = useParams();
  const { moduleAttempts, completedModuleIds } = useLearner();
  let course;
  try {
    course = loadCourse(courseId);
  } catch (e) {
    return (
      <div className="w-full">
        <BackHeader title="Course" to="/courses" />
        <Callout tone="bad">This course could not be loaded: {e.message}</Callout>
      </div>
    );
  }

  const ids = course.modules.map((m) => m.id);
  const done = ids.filter((id) => completedModuleIds.includes(id)).length;
  const pct = Math.round((done / ids.length) * 100);
  const firstOpen = ids.findIndex((id) => !completedModuleIds.includes(id));
  const profile = courseProfile(moduleAttempts, ids);

  return (
    <div className="w-full">
      <BackHeader title={course.title} to="/courses" />
      <p className="text-slate-600 text-lg mb-4">{course.description}</p>

      <div className="panel p-5 mb-5">
        <div className="flex justify-between font-bold"><span>Course progress</span><span>{done} of {ids.length} modules</span></div>
        <div className="bg-indigo-50 h-2.5 rounded-full overflow-hidden mt-2" role="progressbar" aria-label="Course progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-2.5 rounded-full bg-green-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <ol className="grid xl:grid-cols-2 xl:gap-x-10 xl:gap-y-4">
        {course.modules.map((m, i) => {
          const completed = completedModuleIds.includes(m.id);
          const focus = i === firstOpen;
          const latest = latestForModule(moduleAttempts, m.id);
          const s = latest ? moduleSummary(latest.responses) : null;
          return (
            <li key={m.id} className="flex gap-4 pb-4 xl:pb-0 last:pb-0 relative">
              {i < course.modules.length - 1 && <span className="absolute left-5 top-12 bottom-0 w-0.5 bg-indigo-200 xl:hidden" aria-hidden="true" />}
              <span className={`w-11 h-11 rounded-full grid place-items-center shrink-0 z-10 font-extrabold ${completed ? 'bg-green-600 text-white' : focus ? 'bg-brand text-white ring-8 ring-indigo-100' : 'bg-indigo-100 text-brand'}`} aria-hidden="true">
                {completed ? <Check size={22} /> : focus ? <Play size={18} fill="currentColor" /> : i + 1}
              </span>
              <div className={`flex-1 min-w-0 rounded-3xl bg-white p-4 sm:p-5 ${focus ? 'border-2 border-brand' : 'border border-indigo-100'}`}>
                <h2 className="font-extrabold text-lg leading-snug">Module {i + 1}: {m.title}</h2>
                <p className={`text-sm mt-1 font-semibold ${focus ? 'text-brand' : 'text-slate-600'}`}>
                  {completed ? 'Completed' : focus ? 'In Focus' : 'Up next'}
                  {s && <> &middot; Latest quiz {s.correct}/{s.outOf}</>}
                </p>
                <p className="muted mt-2">{m.summary}</p>
                <div className="flex flex-wrap gap-2 mt-4">
                  <Link to={`/course/${courseId}/${m.id}`} className="primary !py-2.5">{completed ? 'Review lesson' : 'Open lesson'}</Link>
                  <Link to={`/course/${courseId}/${m.id}/quiz`} className="secondary">{latest ? 'Retake quiz' : 'Take quiz'}</Link>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {moduleAttempts.length > 0 && (
        <div className="mt-6">
          <CompetencyBars stats={profile} title="Competencies across your latest module quizzes" compact />
        </div>
      )}

      {firstOpen >= 0 && (
        <Link to={`/course/${courseId}/${ids[firstOpen]}`} className="primary w-full md:w-auto md:min-w-[22rem] text-lg !py-4 mt-6">
          Continue Module {firstOpen + 1} <ArrowRight size={20} />
        </Link>
      )}
    </div>
  );
}
