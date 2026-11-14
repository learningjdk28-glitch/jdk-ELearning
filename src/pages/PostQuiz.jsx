import { useRef, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { lessonById } from '../data/lessons.js';
import { COMPETENCIES, LEVELS, LEVEL_LABELS } from '../data/course.js';
import { gradeResponses, competencyStats } from '../lib/scoring.js';
import { levelForLesson, selectQuizQuestions } from '../lib/adaptive.js';
import { questionById } from '../data/questions.js';
import QuizRunner from '../components/QuizRunner.jsx';
import { Callout, Heading, LevelBadge } from '../components/ui.jsx';

export default function PostQuiz() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { stats, attempts, submitAttempt } = useLearner();
  const lesson = lessonById(id);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const before = useRef(null);
  const frozenLevel = useRef(null);
  if (!lesson) return <Navigate to="/courses" replace />;

  if (before.current === null) before.current = stats[lesson.focus];
  if (frozenLevel.current === null) {
    const o = params.get('level');
    frozenLevel.current = LEVELS.includes(o) ? o : levelForLesson(lesson, stats);
  }
  const level = frozenLevel.current;
  const questions = selectQuizQuestions(lesson.id, level);
  const focusName = COMPETENCIES[lesson.focus].name;

  async function onSubmit(selected) {
    setBusy(true);
    setError('');
    try {
      const responses = gradeResponses(questions, selected);
      const attempt = await submitAttempt({ kind: 'lesson', lessonId: lesson.id, level, responses });
      const after = competencyStats([...attempts, attempt])[lesson.focus];
      setResult({ responses, after });
    } catch {
      setError('Your answers could not be saved on this device. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const answered = result.responses.filter((r) => r.answer !== null);
    const correct = answered.filter((r) => r.correct).length;
    const pct = answered.length ? Math.round((correct / answered.length) * 100) : null;
    const b = before.current;
    return (
      <>
        <Heading title="Quiz results" desc={lesson.title} />
        <div className="panel p-6 mb-5">
          <p className="text-3xl font-extrabold">{pct === null ? 'No answers' : `${correct} of ${answered.length} correct (${pct}%)`}</p>
          <p className="muted mt-2">
            {focusName} before: {b.score === null ? 'not assessed' : `${b.score}%`}. Now: {result.after.score === null ? 'not assessed' : `${result.after.score}%`}
            {' '}(based on {result.after.answered} answered questions).
          </p>
          <div className="mt-2"><LevelBadge level={level} /></div>
          <p className="muted mt-3">Lesson saved as completed on this device. It syncs to your account when you are online.</p>
        </div>

        <ul className="space-y-3">
          {result.responses.map((r, i) => {
            const q = questionById(r.questionId);
            const Icon = r.answer === null ? MinusCircle : r.correct ? CheckCircle2 : XCircle;
            const tone = r.answer === null ? 'text-slate-500' : r.correct ? 'text-green-700' : 'text-red-700';
            return (
              <li key={r.questionId} className="panel p-5">
                <div className="flex gap-3">
                  <Icon className={`${tone} shrink-0 mt-0.5`} size={22} aria-label={r.answer === null ? 'Unanswered' : r.correct ? 'Correct' : 'Incorrect'} />
                  <div>
                    <p className="font-semibold">{i + 1}. {q.text}</p>
                    <p className="mt-1 text-sm">
                      Your answer: {r.answer === null ? 'none' : q.options[r.answer]}
                      {!r.correct && <> &middot; Correct answer: <b>{q.options[q.correct]}</b></>}
                    </p>
                    <p className="muted mt-1">{q.explanation}</p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap gap-3 mt-6">
          <Link to="/progress" className="primary">See my progress</Link>
          <Link to="/path" className="secondary">Back to my path</Link>
          <Link to={`/lesson/${lesson.id}`} className="secondary">Review lesson</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <Heading title={`Quiz: ${lesson.title}`} desc={`${LEVEL_LABELS[level]} level. ${questions.length} questions that count toward ${focusName}.`} />
      {error && <div className="mb-4"><Callout tone="bad">{error}</Callout></div>}
      <QuizRunner questions={questions} onSubmit={onSubmit} submitting={busy} showCompetency={false} />
    </>
  );
}
