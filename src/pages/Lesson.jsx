import { useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Lightbulb, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useLearner } from '../context/LearnerContext.jsx';
import { lessonById } from '../data/lessons.js';
import { COMPETENCIES, LEARNING_MODES, LEVELS, LEVEL_DESCRIPTIONS, LEVEL_LABELS } from '../data/course.js';
import { levelForLesson } from '../lib/adaptive.js';
import { RichText, TermDialog } from '../components/Eli5.jsx';
import VisualFlow from '../components/VisualFlow.jsx';
import Activity from '../components/Activity.jsx';
import AudioLesson from '../components/AudioLesson.jsx';
import Notes from '../components/Notes.jsx';
import { ACTIVITIES } from '../data/activities.js';
import { BackHeader, Callout, CompPill, LevelBadge } from '../components/ui.jsx';

export default function Lesson() {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { stats, mode, changeMode, completedIds, hasDiagnostic, online, notifyChange } = useLearner();
  const [term, setTerm] = useState(null);
  const [tab, setTab] = useState('learn');
  const lesson = lessonById(id);
  if (!lesson) return <Navigate to="/courses" replace />;

  const autoLevel = levelForLesson(lesson, stats);
  const override = params.get('level');
  const validOverride = LEVELS.includes(override);
  const level = validOverride ? override : autoLevel;
  const content = lesson.levels[level];
  const comp = COMPETENCIES[lesson.focus];
  const s = stats[lesson.focus];
  const activeMode = LEARNING_MODES.find((m) => m.id === mode && m.status === 'available') ? mode : 'Read/Write';
  const done = completedIds.includes(lesson.id);
  const quizLink = `/quiz/${lesson.id}${validOverride ? `?level=${override}` : ''}`;
  const audioItems = [
    { label: 'Goals', text: `In this lesson you will learn to: ${lesson.objectives.join(' ')}` },
    ...content.body.map((text, i) => ({ label: `Lesson, part ${i + 1}`, text })),
    { label: 'Example', text: `Example. ${content.example}` },
  ];

  function setLevel(next) {
    const p = new URLSearchParams(params);
    if (next === autoLevel) p.delete('level');
    else p.set('level', next);
    setParams(p, { replace: true });
  }

  const tabClass = (active) =>
    `flex-1 text-center rounded-2xl py-3 font-bold ${active ? 'bg-brand text-white' : 'text-slate-700 hover:bg-indigo-100'}`;

  return (
    <div className="max-w-6xl mx-auto">
      <BackHeader
        title={lesson.title}
        to="/path"
        right={
          <span
            className={`hidden sm:flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${online ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'}`}
          >
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

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <CompPill competency={lesson.focus} />
        <LevelBadge level={level} />
        {done && (
          <span className="flex items-center gap-1 text-green-800 font-semibold text-sm">
            <CheckCircle2 size={16} aria-hidden="true" /> Completed
          </span>
        )}
      </div>

      <div className="panel p-4 sm:p-5 mb-4">
        <p className="muted">
          {validOverride
            ? 'Preview chosen by you.'
            : hasDiagnostic && s.sufficient
              ? `Automatic: your ${comp.short} score is ${s.score}%.`
              : 'Automatic: standard level until there is enough evidence.'}{' '}
          {LEVEL_DESCRIPTIONS[level]}
        </p>
        <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Preview a difficulty level">
          {LEVELS.map((l) => (
            <button
              key={l}
              onClick={() => setLevel(l)}
              aria-pressed={l === level}
              className={`rounded-xl px-3 min-h-[44px] text-sm font-bold border ${l === level ? 'bg-brand text-white border-brand' : 'bg-white border-indigo-200 hover:bg-indigo-50'}`}
            >
              {LEVEL_LABELS[l]}
            </button>
          ))}
          {validOverride && override !== autoLevel && (
            <button className="text-sm underline text-brand font-semibold" onClick={() => setLevel(autoLevel)}>Use automatic level</button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 mt-3" role="group" aria-label="Learning mode">
          {LEARNING_MODES.map((m) => (
            <button
              key={m.id}
              disabled={m.status !== 'available'}
              onClick={() => changeMode(m.id)}
              aria-pressed={activeMode === m.id}
              title={m.status !== 'available' ? 'Not available in this MVP' : m.desc}
              className={`rounded-xl px-3 min-h-[44px] text-sm font-bold border disabled:opacity-40 disabled:cursor-not-allowed ${activeMode === m.id ? 'bg-violet-600 text-white border-violet-600' : 'bg-white border-violet-200 hover:bg-violet-50'}`}
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
            <AudioLesson items={audioItems} resetKey={`${lesson.id}-${level}-${activeMode}`} />
          ) : activeMode === 'Kinesthetic' ? (
            <section aria-label="Hands-on lesson">
              <p className="text-xl leading-8 mb-5"><RichText text={content.body[0]} onTerm={setTerm} /></p>
              <Activity key={lesson.id} activity={ACTIVITIES[lesson.id]} />
            </section>
          ) : activeMode === 'Visual' ? (
            <section aria-label="Visual lesson">
              <p className="text-xl leading-8 mb-5"><RichText text={content.body[0]} onTerm={setTerm} /></p>
              <div className="rounded-3xl bg-indigo-50 p-4 sm:p-5">
                <VisualFlow steps={content.steps} />
              </div>
            </section>
          ) : (
            <section aria-label="Reading lesson">
              <div className="space-y-4 text-lg leading-8">
                {content.body.map((p) => <p key={p}><RichText text={p} onTerm={setTerm} /></p>)}
              </div>
              <Notes userId={user.id} lessonId={lesson.id} onSaved={notifyChange} />
            </section>
          )}

          <div className="rounded-3xl bg-amber-50 border border-amber-200 p-5 mt-5 flex gap-3">
            <Lightbulb className="text-amber-500 shrink-0" size={24} aria-hidden="true" />
            <p className="leading-7">
              <b>Example:</b> <RichText text={content.example} onTerm={setTerm} />
            </p>
          </div>

          <div className="mt-6">
            <h3 className="font-extrabold mb-2">Tap a term for an ELI5 explanation</h3>
            <div className="flex flex-wrap gap-2">
              {lesson.terms.map((t) => (
                <button key={t} className="secondary capitalize" onClick={() => setTerm(t)}>{t}</button>
              ))}
            </div>
            <p className="muted mt-2">Highlighted words in the text are tappable too. <Link to="/glossary" className="underline">Open the full glossary</Link>.</p>
          </div>

          <button className="primary w-full mt-7 text-lg !py-4" onClick={() => setTab('practice')}>
            Next: Practice <ArrowRight size={20} />
          </button>
        </div>
      ) : (
        <div className="panel p-5 sm:p-6">
          <div className="bg-emerald-50 rounded-2xl p-5">
            <h2 className="font-extrabold">Practice ({LEVEL_LABELS[level]})</h2>
            <p className="mt-2 text-lg leading-8">{content.practice}</p>
          </div>
          <p className="muted mt-3">Use the notes box in Read/Write mode to write your answer. Practice is not scored.</p>
          <div className="flex flex-col sm:flex-row gap-3 mt-6">
            <Link className="primary flex-1 !py-4 text-lg" to={quizLink}>Next: Quiz <ArrowRight size={20} /></Link>
            <button className="secondary" onClick={() => setTab('learn')}>Back to lesson</button>
          </div>
        </div>
      )}

      {done && <div className="mt-4"><Callout tone="good">You have already completed this lesson. Retaking the quiz adds to your history.</Callout></div>}
      <TermDialog term={term} onClose={() => setTerm(null)} />
    </div>
  );
}
