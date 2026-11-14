import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Check, ClipboardCheck, Clock, CloudOff, RotateCcw, X } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import useOnSynced from '../hooks/useOnSynced.js';
import { newClientId } from '../services/offline.js';
import { attemptReview, loadQuizPage, submitQuiz } from '../services/quizzes.js';
import { deadlineState, dueLabel } from '../lib/submissionRules.js';
import { formatDue } from '../components/learn/AssignmentList.jsx';
import { ErrorState, LoadingState } from '../components/learn/States.jsx';

/** One quiz: deadline, questions, then the score and a per-question review with explanations. */
export default function StudentQuiz() {
  const { courseId, quizId } = useParams();
  const { data, loading, error, reload, setData } = useLoad(() => loadQuizPage(quizId), [quizId]);
  const [clientId, setClientId] = useState(newClientId);
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState('');
  // Answers sent from the outbox come back scored: show the result straight away.
  useOnSynced((item) => item.kind === 'quiz' && item.payload.quizId === quizId, (item, scored) => { setResult(scored); reload(); });

  const courseLink = `/learn/${encodeURIComponent(courseId)}`;
  if (loading) return <LoadingState label="Loading quiz..." />;
  if (error) return <div className="max-w-3xl mx-auto space-y-4"><Link to={courseLink} className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> Course</Link><ErrorState error={error} onRetry={reload} /></div>;

  const { quiz, attempts } = data;
  const moduleLink = `${courseLink}/module/${quiz.module_id}?step=check`;
  const state = deadlineState(quiz.due_at, quiz.allow_late);
  const passedBefore = attempts.some((a) => a.passed);
  const answered = Object.keys(answers).length;

  async function submit(e) {
    e.preventDefault();
    setSubmitError(''); setBusy(true);
    try {
      const r = await submitQuiz(quizId, answers, clientId, quiz.title);
      setAnswers({}); setClientId(newClientId());
      if (r.queued) { setData((d) => ({ ...d, pending: { createdAt: new Date().toISOString() } })); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      setResult(r);
      setData((d) => ({ ...d, attempts: [{ id: r.attempt_id, score: r.score, passed: r.passed, is_late: r.is_late, submitted_at: new Date().toISOString() }, ...d.attempts] }));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { setSubmitError(err.message); } finally { setBusy(false); }
  }
  async function openReview(id) {
    setSubmitError(''); setBusy(true);
    try { setResult(await attemptReview(id)); window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (err) { setSubmitError(err.message); } finally { setBusy(false); }
  }
  const retake = () => { setResult(null); setAnswers({}); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-16">
      <Link to={moduleLink} className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> Back to the module</Link>
      <header className="panel p-5 sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-text-muted flex items-center gap-2"><ClipboardCheck size={16} className="text-brand" aria-hidden="true" /> Quiz</p>
        <h1 className="text-2xl sm:text-3xl font-black text-text mt-1">{quiz.title}</h1>
        <p className="text-text-muted mt-2">{quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'} · pass mark {quiz.pass_mark}%{passedBefore ? ' · you have passed this quiz' : ''}</p>
        {quiz.due_at && (
          <p className={`mt-3 flex items-center gap-2 text-sm font-semibold ${state === 'open' ? 'text-text' : state === 'late' ? 'text-warning' : 'text-danger'}`}>
            <Clock size={16} aria-hidden="true" /> Due {formatDue(quiz.due_at)} · {dueLabel(quiz.due_at)}
          </p>
        )}
      </header>

      {submitError && <p role="alert" className="rounded-xl bg-danger/10 border border-danger/30 text-danger p-3">{submitError}</p>}

      {data.pending && !result ? (
        <section className="panel p-6 border-warning/40" role="status">
          <p className="flex items-center gap-2 font-black text-lg text-text"><CloudOff size={20} className="text-warning" aria-hidden="true" /> Submitted — will be graded when you reconnect</p>
          <p className="text-text-muted mt-2">
            Your answers are saved on this device ({new Date(data.pending.createdAt).toLocaleString()}). They are sent and scored automatically as soon as you are online,
            and you will see your score here. You cannot answer this quiz again until then.
          </p>
          {quiz.due_at && <p className="text-sm text-text-muted mt-2">The deadline is checked when your answers reach the server.</p>}
          <Link to={moduleLink} className="secondary mt-4">Back to the module</Link>
        </section>
      ) : result ? (
        <ResultView quiz={quiz} result={result} canRetake={state !== 'closed'} onRetake={retake} moduleLink={moduleLink} />
      ) : state === 'closed' ? (
        <section className="panel p-6" role="status">
          <p className="font-bold text-text">This quiz is closed.</p>
          <p className="text-text-muted mt-1">The deadline has passed and your instructor does not accept late attempts.</p>
        </section>
      ) : quiz.questions.length === 0 ? (
        <section className="panel p-6 text-text-muted">This quiz has no questions yet.</section>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          {state === 'late' && <p className="rounded-xl bg-warning/10 border border-warning/30 text-text p-3">The deadline has passed. You can still take the quiz, but this attempt will be marked late.</p>}
          {quiz.questions.map((q, i) => (
            <fieldset key={q.id} className="panel p-5 sm:p-6">
              <legend className="sr-only">Question {i + 1}</legend>
              <p className="text-xs font-bold uppercase tracking-wider text-brand">Question {i + 1} of {quiz.questions.length}</p>
              <p className="font-black text-lg text-text mt-2 mb-4 whitespace-pre-line">{q.prompt}</p>
              <div className="space-y-2">
                {q.options.map((option, index) => {
                  const on = answers[q.id] === index;
                  return (
                    <label key={index} className={`flex gap-3 items-start p-4 rounded-xl border cursor-pointer text-text ${on ? 'border-brand bg-brand-soft' : 'border-border bg-surface-raised'}`}>
                      <input type="radio" className="accent-brand w-4 h-4 mt-1" name={q.id} checked={on} onChange={() => setAnswers((v) => ({ ...v, [q.id]: index }))} />
                      <span>{option}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
          <div className="panel p-4 flex flex-wrap items-center justify-between gap-3 sticky bottom-3">
            <span className="text-sm text-text-muted">{answered} of {quiz.questions.length} answered</span>
            <button className="primary" disabled={busy || answered < quiz.questions.length}>{busy ? 'Scoring...' : 'Submit answers'}</button>
          </div>
        </form>
      )}

      {!result && attempts.length > 0 && (
        <section className="panel p-5" aria-labelledby="past-attempts">
          <h2 id="past-attempts" className="font-black text-text">Your attempts</h2>
          <ul className="mt-3 space-y-2">
            {attempts.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border p-3">
                <span className="text-text">
                  <span className="font-bold">{Number(a.score)}%</span> · {a.passed ? <span className="text-success font-semibold">passed</span> : 'not passed'}
                  {a.is_late && <span className="text-warning font-semibold"> · late</span>}
                  <span className="text-text-muted text-sm"> · {new Date(a.submitted_at).toLocaleString()}</span>
                </span>
                <button className="secondary text-sm" disabled={busy} onClick={() => openReview(a.id)}>Review</button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function ResultView({ quiz, result, canRetake, onRetake, moduleLink }) {
  const byId = Object.fromEntries((result.review || []).map((r) => [r.questionId, r]));
  const revealed = (result.review || []).some((r) => r.correctIndex != null);
  return (
    <>
      <section className={`panel p-6 text-center ${result.passed ? 'border-success/40' : 'border-warning/40'}`} role="status">
        <p className="text-sm font-bold uppercase tracking-wider text-text-muted">{result.passed ? 'You passed' : 'Not passed yet'}</p>
        <p className={`text-5xl font-black mt-2 ${result.passed ? 'text-success' : 'text-warning'}`}>{Number(result.score)}%</p>
        <p className="text-text-muted mt-2">{result.correct} of {result.total} correct · pass mark {result.pass_mark}%{result.is_late ? ' · submitted late' : ''}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {canRetake && <button className="secondary" onClick={onRetake}><RotateCcw size={16} aria-hidden="true" /> {result.passed ? 'Take it again' : 'Try again'}</button>}
          <Link to={moduleLink} className="primary">Back to the module</Link>
        </div>
      </section>
      <section aria-labelledby="review-heading" className="space-y-3">
        <h2 id="review-heading" className="text-xl font-black text-text">Review your answers</h2>
        {!revealed && <p className="text-sm text-text-muted">The correct answers appear once you pass, or after the deadline. Read the explanations and try again.</p>}
        {quiz.questions.map((q, i) => {
          const r = byId[q.id];
          if (!r) return null;
          return (
            <article key={q.id} className={`panel p-5 border-l-4 ${r.correct ? 'border-l-success' : 'border-l-danger'}`}>
              <p className="flex items-start gap-2 font-bold text-text">
                {r.correct ? <Check size={20} className="text-success shrink-0" aria-label="Correct" /> : <X size={20} className="text-danger shrink-0" aria-label="Incorrect" />}
                <span>{i + 1}. {q.prompt}</span>
              </p>
              <p className="mt-2 text-sm text-text">Your answer: <span className="font-semibold">{r.choice != null ? q.options[r.choice] : 'No answer'}</span></p>
              {!r.correct && r.correctIndex != null && <p className="mt-1 text-sm text-success">Correct answer: <span className="font-semibold">{q.options[r.correctIndex]}</span></p>}
              {r.explanation && <p className="mt-3 rounded-xl bg-surface-muted p-3 text-sm text-text whitespace-pre-line">{r.explanation}</p>}
            </article>
          );
        })}
      </section>
    </>
  );
}
