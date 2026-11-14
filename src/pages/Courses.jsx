import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { COURSE, COMPETENCIES } from '../data/course.js';
import { LESSONS } from '../data/lessons.js';
import { loadCourse } from '../lib/courseContent.js';
import { Heading, LevelBadge } from '../components/ui.jsx';
import CourseCard from '../components/CourseCard.jsx';

export default function Courses() {
  const { completedIds, completedModuleIds, hasDiagnostic, path, mode } = useLearner();
  const levelFor = (id) => path.find((p) => p.lesson.id === id)?.level;
  let nb = null;
  try {
    nb = loadCourse('networking-basics');
  } catch {
    nb = null;
  }
  const dlPct = Math.round((completedIds.length / LESSONS.length) * 100);
  const nbDone = nb ? nb.modules.filter((m) => completedModuleIds.includes(m.id)).length : 0;

  return (
    <>
      <Heading title="Courses" desc="Choose a course. Lessons, quizzes and the glossary work offline after the first visit." />
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <CourseCard to="#digital-literacy" eyebrow="Course" title={COURSE.title} pct={dlPct} caption={`${completedIds.length} of ${LESSONS.length} lessons completed`} />
        {nb ? (
          <CourseCard to="/course/networking-basics" eyebrow="Course" title={nb.title} pct={Math.round((nbDone / nb.modules.length) * 100)} caption={`${nbDone} of ${nb.modules.length} modules completed`} />
        ) : (
          <div className="panel p-6"><p className="font-bold">Networking Basics</p><p className="text-red-800 mt-2">This course could not be loaded.</p></div>
        )}
      </div>

      <div id="digital-literacy" className="scroll-mt-24">
        <Heading title={COURSE.title} desc={COURSE.description}>
          <div className="flex flex-wrap gap-2">
            <Link to="/modes" className="secondary">Learning mode: {mode}</Link>
            <Link to={hasDiagnostic ? '/path' : '/modes'} className="primary">
              {hasDiagnostic ? 'My learning path' : 'Start: choose mode and take pre-test'}
            </Link>
          </div>
        </Heading>

        <div className="grid md:grid-cols-2 gap-4">
          {LESSONS.map((l, i) => {
            const done = completedIds.includes(l.id);
            return (
              <Link to={`/lesson/${l.id}`} key={l.id} className="panel p-6 hover:border-indigo-400">
                <div className="flex justify-between items-center">
                  <span className="text-indigo-700 font-bold">Lesson {i + 1}</span>
                  {done ? (
                    <span className="flex items-center gap-1 text-sm text-green-800 font-semibold">
                      <CheckCircle2 size={16} aria-hidden="true" /> Completed
                    </span>
                  ) : (
                    <span className="text-sm text-slate-600">Not completed</span>
                  )}
                </div>
                <h2 className="font-bold text-xl mt-3">{l.title}</h2>
                <p className="muted mt-2">{l.summary}</p>
                <p className="muted mt-2">Builds: {COMPETENCIES[l.focus].name}</p>
                <div className="flex items-center justify-between mt-4">
                  {hasDiagnostic ? <LevelBadge level={levelFor(l.id)} /> : <span className="muted">Standard level until you take the pre-test</span>}
                  <span className="text-indigo-700 font-semibold">Open lesson</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
