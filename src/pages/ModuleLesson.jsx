import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Lightbulb, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { LEARNING_MODES } from '../data/course.js';
import { loadModule } from '../lib/courseContent.js';
import { plainText } from '../lib/contentParse.js';
import { RichText, TermDialog } from '../components/Eli5.jsx';
import Markdown from '../components/Markdown.jsx';
import VisualFlow from '../components/VisualFlow.jsx';
import Activity from '../components/Activity.jsx';
import AudioLesson from '../components/AudioLesson.jsx';
import Notes from '../components/Notes.jsx';
import { BackHeader, Callout } from '../components/ui.jsx';

export default function ModuleLesson() {
  const { courseId, moduleId } = useParams();
  const { user } = useAuth();
  const { mode, changeMode, completedModuleIds, online, notifyChange } = useLearner();
  const [term, setTerm] = useState(null);
  const [tab, setTab] = useState('learn');

  let data;
  try {
    data = loadModule(courseId, moduleId);
  } catch (e) {
    return (
      <div className="max-w-6xl mx-auto">
        <BackHeader title="Lesson" to={`/course/${courseId}`} />
        <Callout tone="bad">This lesson could not be loaded: {e.message}</Callout>
      </div>
    );
  }

  const { course, module, index, lesson, activity } = data;
  const next = course.modules[index + 1];
  const done = completedModuleIds.includes(module.id);
  const activeMode = LEARNING_MODES.find((m) => m.id === mode && m.status === 'available') ? mode : 'Read/Write';
  const quizLink = `/course/${courseId}/${module.id}/quiz`;
  const audioItems = [
    { label: 'Goals', text: `In this lesson you will learn to: ${lesson.objectives.join(' ')}` },
    ...lesson.sections.map((s) => ({ label: s.title, text: `${s.title}. ${plainText(s.body)}` })),
    { label: 'Example', text: `Example. ${plainText(lesson.example)}` },
  ];
  const tabClass = (active) => `flex-1 text-center rounded-2xl py-3 font-bold ${active ? 'bg-brand text-white' : 'text-slate-700 hover:bg-indigo-100'}`;

  return (
    <div className="max-w-6xl mx-auto">
      <BackHeader
        title={`Module ${index + 1}: ${module.title}`}
        to={`/course/${courseId}`}
        right={
          <span className={`hidden sm:flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${online ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}>
            {online ? <Wifi size={14} aria-hidden="true" /> : <WifiOff size={14} aria-hidden="true" />}
            {online ? 'Online' : 'Offline'}
          </span>
        }
      />

      <div className="flex gap-1 rounded-3xl bg-indigo-50 p-1.5 mb-4" role="tablist" aria-label="Lesson sections">
        <button role="tab" aria-selected={tab === 'learn'} className={tabClass(tab === 'learn')} onClick={() => setTab('learn')}>Learn</button>
        <button role="tab" aria-selected={tab === 'practice'} className={tabClass(tab === 'practice')} onClick={() => setTab('practice')}>Practice</button>
        <Link role="tab" aria-selected="false" className={tabClass(false)} to={quizLink}>Quiz</Link>
      </div>

      {done && (
        <p className="flex items-center gap-1 text-green-800 font-semibold text-sm mb-3">
          <CheckCircle2 size={16} aria-hidden="true" /> Completed
        </p>
      )}

      <div className="panel p-4 sm:p-5 mb-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Learning mode">
          {LEARNING_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => changeMode(m.id)}
              aria-pressed={activeMode === m.id}
              title={m.desc}
              className={`rounded-xl px-3 min-h-[44px] text-sm font-bold border ${activeMode === m.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white border-violet-200 hover:bg-violet-50'}`}
            >
              {m.id}
            </button>
          ))}
        </div>
      </div>

      {tab === 'learn' ? (
        <div className="panel p-5 sm:p-6">
          <section aria-label="Learning objectives" className="mb-5 rounded-2xl bg-indigo-50 p-4">
            <h2 className="font-extrabold">You will learn to</h2>
            <ul className="list-disc pl-5 mt-1 space-y-0.5">
              {lesson.objectives.map((o) => <li key={o}>{o}</li>)}
            </ul>
          </section>

          {activeMode === 'Auditory' ? (
            <AudioLesson items={audioItems} resetKey={`${module.id}-${activeMode}`} />
          ) : activeMode === 'Kinesthetic' ? (
            <section aria-label="Hands-on lesson" className="space-y-5">
              <Markdown text={lesson.sections[0].body} onTerm={setTerm} />
              <Activity key={`learn-${module.id}`} activity={activity} />
            </section>
          ) : activeMode === 'Visual' ? (
            <section aria-label="Visual lesson">
              <div className="mb-5 text-lg leading-8"><Markdown text={lesson.sections[0].body} onTerm={setTerm} /></div>
              <div className="rounded-3xl bg-indigo-50 p-4 sm:p-5"><VisualFlow steps={lesson.steps} /></div>
            </section>
          ) : (
            <section aria-label="Reading lesson" className="space-y-6">
              {lesson.sections.map((s) => (
                <div key={s.title}>
                  <h2 className="font-extrabold text-xl mb-2">{s.title}</h2>
                  <Markdown text={s.body} onTerm={setTerm} />
                </div>
              ))}
              <Notes userId={user.id} lessonId={module.id} onSaved={notifyChange} />
            </section>
          )}

          <div className="rounded-3xl bg-amber-50 border border-amber-200 p-5 mt-5 flex gap-3">
            <Lightbulb className="text-amber-500 shrink-0" size={24} aria-hidden="true" />
            <p className="leading-7"><b>Example:</b> <RichText text={lesson.example} onTerm={setTerm} /></p>
          </div>

          <div className="mt-6">
            <h3 className="font-extrabold mb-2">Tap a term for an ELI5 explanation</h3>
            <div className="flex flex-wrap gap-2">
              {lesson.terms.map((t) => <button key={t} className="secondary capitalize" onClick={() => setTerm(t)}>{t}</button>)}
            </div>
          </div>

          <button className="primary w-full mt-7 text-lg !py-4" onClick={() => setTab('practice')}>
            Next: Practice <ArrowRight size={20} />
          </button>
        </div>
      ) : (
        <div className="panel p-5 sm:p-6 space-y-5">
          <div className="bg-emerald-50 rounded-2xl p-5">
            <h2 className="font-extrabold">Practice</h2>
            <p className="mt-2 text-lg leading-8">{lesson.practice}</p>
          </div>
          <Activity key={`practice-${module.id}`} activity={activity} />
          <div className="flex flex-col sm:flex-row gap-3">
            <Link className="primary flex-1 !py-4 text-lg" to={quizLink}>Next: Quiz <ArrowRight size={20} /></Link>
            <button className="secondary" onClick={() => setTab('learn')}>Back to lesson</button>
            {next && <Link className="secondary" to={`/course/${courseId}/${next.id}`}>Skip to next module</Link>}
          </div>
        </div>
      )}
      <TermDialog term={term} onClose={() => setTerm(null)} />
    </div>
  );
}
