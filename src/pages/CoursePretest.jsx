import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CheckCheck, ClipboardList, CloudOff, MapPin, RotateCcw, TrendingUp } from 'lucide-react';
import useLoad from '../hooks/useLoad.js';
import useOnSynced from '../hooks/useOnSynced.js';
import { newClientId } from '../services/offline.js';
import { loadPretest, submitPretest } from '../services/learn.js';
import { levelName } from '../lib/pageVersions.js';
import { prePost } from '../lib/analyticsRules.js';
import { PairedBars } from '../components/charts/Bars.jsx';
import { moduleLink } from '../components/learn/PathList.jsx';
import { EmptyState, ErrorState, LoadingState } from '../components/learn/States.jsx';

/**
 * Course pre-test: measures what the student knows and sets where they start and which page version they see.
 * With ?stage=post it is the post-test: the same questions after the course, compared with the first pre-test.
 */
export default function CoursePretest() {
  const { courseId } = useParams();
  const [params] = useSearchParams();
  const stage = params.get('stage') === 'post' ? 'post' : 'pre';
  const { data, loading, error, reload } = useLoad(() => loadPretest(courseId), [courseId]);
  const [mode, setMode] = useState(null); // null = decide from data, 'taking', 'result'
  useOnSynced((item) => item.kind === 'pretest' && item.payload.courseId === courseId && (item.payload.stage || 'pre') === stage, () => { setMode(null); reload(); });
  const courseLink = `/learn/${encodeURIComponent(courseId)}`;
  const back = <Link to={courseLink} className="inline-flex items-center gap-2 font-semibold text-brand"><ArrowLeft size={18} aria-hidden="true" /> Course</Link>;

  if (loading) return <LoadingState label="Loading pre-test..." />;
  if (error) {
    if (/unavailable/i.test(error.message)) {
      return <div className="max-w-3xl mx-auto space-y-4">{back}<EmptyState title="This course has no pre-test">Start the course from the first module.</EmptyState></div>;
    }
    return <ErrorState error={error} onRetry={reload} />;
  }

  const latest = data.attempts.find((a) => a.stage === stage) || null;
  const pending = stage === 'post' ? data.pendingPost : data.pending;
  const view = pending ? 'pending' : mode || (latest ? 'result' : 'intro');
  const questions = data.pretest.questions;

  return (
    <div className="max-w-3xl mx-auto pb-16 space-y-5">
      {back}
      <header>
        <p className="text-sm font-bold uppercase tracking-wider text-text-muted">{stage === 'post' ? 'Post-test' : 'Pre-test'} · {data.pretest.course_title}</p>
        <h1 className="text-2xl sm:text-3xl font-black text-text mt-1">{stage === 'post' ? 'See what you have learned' : 'Find your starting point'}</h1>
      </header>

      {view === 'pending' && (
        <section className="panel p-6 border-warning/40" role="status">
          <p className="flex items-center gap-2 font-black text-lg text-text"><CloudOff size={20} className="text-warning" aria-hidden="true" /> Submitted — will be scored when you reconnect</p>
          <p className="text-text-muted mt-2">Your answers are saved on this device. They are sent automatically when you are online, and your starting point appears here. Until then you can start from the first module.</p>
          <Link to={courseLink} className="secondary mt-4">Back to the course</Link>
        </section>
      )}

      {view === 'intro' && stage === 'post' && (
        <section className="panel p-6">
          <TrendingUp size={32} className="text-brand" aria-hidden="true" />
          <p className="text-text mt-3">
            The same {questions.length} questions as the pre-test. Your answers are compared with your first pre-test, module by module,
            so you can see how much you have learned. It does not change where you start or which page versions you see.
          </p>
          {questions.length === 0
            ? <p className="mt-5 text-warning">This test has no questions yet.</p>
            : <button className="primary mt-5" onClick={() => setMode('taking')}>Start the post-test <ArrowRight size={16} aria-hidden="true" /></button>}
        </section>
      )}

      {view === 'intro' && stage === 'pre' && (
        <section className="panel p-6">
          <ClipboardList size={32} className="text-brand" aria-hidden="true" />
          <p className="text-text mt-3">
            {questions.length} short questions about the whole course. There is no pass or fail: your answers show which modules you already know,
            so you can start where it makes sense for you.
          </p>
          <ul className="mt-3 list-disc pl-6 text-text-muted space-y-1">
            <li>Modules where you score {data.pretest.pass_mark}% or more are marked <strong className="text-text">tested out</strong>. You can still open them.</li>
            <li>Your overall score picks the version of each page you see first. You can switch versions on any page.</li>
            <li>If you are not sure, leave a question blank. Guessing makes your starting point less accurate.</li>
          </ul>
          {questions.length === 0
            ? <p className="mt-5 text-warning">This pre-test has no questions yet.</p>
            : <button className="primary mt-5" onClick={() => setMode('taking')}>Start the pre-test <ArrowRight size={16} aria-hidden="true" /></button>}
        </section>
      )}

      {view === 'taking' && <Taking courseId={courseId} stage={stage} title={data.pretest.course_title} questions={questions} onDone={async () => { await reload(); setMode('result'); }} onCancel={() => setMode(null)} />}

      {view === 'result' && latest && stage === 'post' && <PostResult attempts={data.attempts} courseId={courseId} onRetake={() => setMode('taking')} />}

      {view === 'result' && latest && stage === 'pre' && <Result attempt={latest} levels={data.levels} courseId={courseId} onRetake={() => setMode('taking')} />}
    </div>
  );
}

function Taking({ courseId, stage, title, questions, onDone, onCancel }) {
  const [answers, setAnswers] = useState({});
  const [clientId] = useState(newClientId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const answered = Object.keys(answers).length;

  async function submit(e) {
    e.preventDefault();
    if (answered < questions.length && !window.confirm(`${questions.length - answered} question(s) are blank. They count as "not known yet". Submit anyway?`)) return;
    setBusy(true); setError('');
    try {
      await submitPretest(courseId, Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })), clientId, stage, `${stage === 'post' ? 'Post-test' : 'Pre-test'}: ${title}`);
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <p className="sticky top-16 z-10 rounded-xl bg-surface-raised border border-border px-4 py-2 text-sm font-semibold text-text" role="status">
        {answered} of {questions.length} answered
      </p>
      {questions.map((q, i) => (
        <fieldset key={q.id} className="panel p-5">
          <legend className="sr-only">Question {i + 1}</legend>
          <p className="text-xs font-bold uppercase tracking-wider text-text-muted">Question {i + 1} of {questions.length}</p>
          <p className="font-bold text-text text-lg mt-1">{q.prompt}</p>
          <div className="mt-3 grid gap-2">
            {q.options.map((opt, j) => (
              <label key={j} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer ${answers[q.id] === j ? 'border-brand bg-brand-soft' : 'border-border hover:bg-surface-muted'}`}>
                <input type="radio" name={q.id} className="accent-brand w-4 h-4" checked={answers[q.id] === j} onChange={() => setAnswers((a) => ({ ...a, [q.id]: j }))} />
                <span className="text-text">{opt}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {error && <p role="alert" className="rounded-xl bg-danger/10 border border-danger/30 text-danger p-3">{error}</p>}
      <div className="flex flex-wrap gap-3">
        <button className="primary" disabled={busy}>{busy ? 'Checking your answers...' : stage === 'post' ? 'Submit post-test' : 'Submit pre-test'}</button>
        <button type="button" className="secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </form>
  );
}

function Result({ attempt, levels, courseId, onRetake }) {
  const level = levels.find((l) => l.id === attempt.level_id);
  const testedOut = useMemo(() => new Set(attempt.tested_out || []), [attempt]);
  const start = attempt.modules.find((m) => m.module_id === attempt.start_module_id);
  return (
    <>
      <section className="panel p-6" aria-labelledby="result-heading">
        <h2 id="result-heading" className="text-xl font-black text-text">Your result</h2>
        <p className="text-4xl font-black text-brand mt-2 tabular-nums">{Math.round(attempt.score)}%</p>
        <p className="text-text-muted">{attempt.correct_count} of {attempt.question_count} correct · {new Date(attempt.submitted_at).toLocaleDateString()}</p>
        {level && <p className="mt-4 text-text">Pages will start in the <strong>{levelName(level)}</strong> version where one exists. You can switch on any page.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {start
            ? <Link className="primary" to={moduleLink(courseId, start.module_id, 0)}>Start at: {start.title} <ArrowRight size={16} aria-hidden="true" /></Link>
            : <Link className="primary" to={`/learn/${encodeURIComponent(courseId)}`}>You tested out of every module — review the course <ArrowRight size={16} aria-hidden="true" /></Link>}
          <button className="secondary" onClick={onRetake}><RotateCcw size={16} aria-hidden="true" /> Retake</button>
        </div>
      </section>

      <section className="panel p-5 sm:p-6" aria-labelledby="by-module">
        <h2 id="by-module" className="font-black text-lg text-text">By module</h2>
        <ul className="mt-3 divide-y divide-border">
          {attempt.modules.map((m, i) => {
            const isOut = testedOut.has(m.module_id);
            const isStart = m.module_id === attempt.start_module_id;
            return (
              <li key={m.module_id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-xs text-text-muted">Module {i + 1}</span>
                  <span className="block font-semibold text-text">{m.title}</span>
                </span>
                <span className="flex items-center gap-3 text-sm">
                  <span className="text-text-muted tabular-nums">{m.total ? `${m.correct}/${m.total}` : 'no questions'}</span>
                  {isOut ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success px-2.5 py-1 font-bold"><CheckCheck size={14} aria-hidden="true" /> Tested out</span>
                    : isStart ? <span className="inline-flex items-center gap-1 rounded-full bg-brand-soft text-brand px-2.5 py-1 font-bold"><MapPin size={14} aria-hidden="true" /> Start here</span>
                    : <span className="rounded-full bg-surface-muted text-text-muted px-2.5 py-1 font-semibold">Later</span>}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

/** Post-test result: first pre-test vs latest post-test, overall and per module. */
function PostResult({ attempts, courseId, onRetake }) {
  const pp = prePost(attempts);
  return (
    <>
      <section className="panel p-6" aria-labelledby="post-heading">
        <h2 id="post-heading" className="text-xl font-black text-text">Your progress</h2>
        <div className="mt-3 flex flex-wrap items-end gap-6">
          <p><span className="block text-sm text-text-muted">First pre-test</span><span className="text-3xl font-black text-text tabular-nums">{pp.pre ?? '—'}{pp.pre != null && '%'}</span></p>
          <p><span className="block text-sm text-text-muted">Post-test</span><span className="text-3xl font-black text-text tabular-nums">{pp.post}%</span></p>
          {pp.gain != null && <p className={`text-lg font-bold ${pp.gain >= 0 ? 'text-success' : 'text-warning'}`}>{pp.gain >= 0 ? '+' : ''}{pp.gain} points</p>}
        </div>
        {pp.pre == null && <p className="text-sm text-text-muted mt-2">You did not take the pre-test, so there is nothing to compare with.</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          <Link className="primary" to={`/learn/${encodeURIComponent(courseId)}`}>Back to the course</Link>
          <button className="secondary" onClick={onRetake}><RotateCcw size={16} aria-hidden="true" /> Retake</button>
        </div>
      </section>
      {pp.modules.length > 0 && (
        <section className="panel p-5 sm:p-6" aria-labelledby="post-by-module">
          <h2 id="post-by-module" className="font-black text-lg text-text mb-3">By module</h2>
          <PairedBars label="Pre-test and post-test score by module" rows={pp.modules.map((m) => ({ key: m.module_id, label: m.title, a: m.pre, b: m.post }))} />
        </section>
      )}
    </>
  );
}
