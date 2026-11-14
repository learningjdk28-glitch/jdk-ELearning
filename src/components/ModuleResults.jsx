import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowRight, CheckCircle2, Lightbulb, MinusCircle, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { COMPETENCIES } from '../data/course.js';
import { moduleSummary, reviewSuggestion, strengthsGaps } from '../lib/modules.js';
import { COMP_STYLE } from './ui.jsx';

/**
 * Results for ONE module attempt: totals, four-area graph, strengths and gaps, suggestion, question review.
 * Everything is calculated from the saved responses. questions = snapshot saved with the attempt.
 */
export default function ModuleResults({ courseId, module, nextModule, attempt, questions, history }) {
  const summary = moduleSummary(attempt.responses);
  const { strongest, weakest, allTied, notAssessed } = strengthsGaps(summary.byCompetency);
  const suggestion = reviewSuggestion(summary);
  const base = `/course/${courseId}/${module.id}`;
  const byId = Object.fromEntries(questions.map((q) => [q.id, q]));
  const chartData = summary.byCompetency.map((c) => ({ name: c.short, Correct: c.correct, outOf: c.outOf }));
  const unanswered = summary.outOf - summary.answered;
  const latestId = history.length ? history[history.length - 1].id : null;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="text-center">
        <Trophy className="mx-auto text-amber-500" size={64} aria-hidden="true" />
        <h2 className="text-3xl font-extrabold mt-2">Module quiz complete!</h2>
        <p className="text-slate-600 text-lg">{module.title}</p>
        <p className="text-4xl font-extrabold mt-3" aria-label={`${summary.correct} correct out of ${summary.outOf}`}>
          {summary.correct} / {summary.outOf}
        </p>
        <p className="muted mt-1">
          Attempt of {new Date(attempt.createdAt).toLocaleString()}
          {attempt.id === latestId ? ' (latest attempt)' : ' (earlier attempt)'}
        </p>
        {unanswered > 0 && <p className="text-amber-800 font-semibold mt-1">{unanswered} question{unanswered === 1 ? ' was' : 's were'} left unanswered and earned no credit.</p>}
      </div>

      <section className="panel p-5 sm:p-6" aria-labelledby="perf">
        <h3 id="perf" className="font-extrabold text-lg mb-4">Performance by competency</h3>
        <div className="divide-y divide-indigo-50">
          {summary.byCompetency.map((c) => {
            const st = COMP_STYLE[c.competency];
            const Icon = st.Icon;
            return (
              <div key={c.competency} className="flex gap-4 items-start py-4 first:pt-0 last:pb-0">
                <div className={`tile ${st.tile}`}><Icon size={24} aria-hidden="true" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold">{c.name}</span>
                    <span className="font-extrabold tabular-nums">{c.answered === 0 ? 'Not assessed' : `${c.correct} of ${c.outOf}`}</span>
                  </div>
                  <div className="bg-indigo-50 h-2.5 rounded-full overflow-hidden mt-2" role="progressbar" aria-label={`${c.name}: ${c.correct} of ${c.outOf}`} aria-valuemin={0} aria-valuemax={c.outOf} aria-valuenow={c.correct}>
                    <div className={`h-2.5 rounded-full ${st.bar}`} style={{ width: `${c.outOf ? (c.correct / c.outOf) * 100 : 0}%` }} />
                  </div>
                  <p className="muted mt-1">
                    {c.percent === null ? 'No answers in this area.' : `${c.percent}% · ${c.label}`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-5" role="img" aria-label={`Bar chart of correct answers: ${summary.byCompetency.map((c) => `${c.short} ${c.correct} of ${c.outOf}`).join(', ')}`} style={{ width: '100%', height: 220 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ left: -15 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 3]} ticks={[0, 1, 2, 3]} allowDecimals={false} />
              <Tooltip formatter={(v) => `${v} of 3`} />
              <Bar dataKey="Correct" fill="#4f3fd9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="rounded-3xl bg-green-50 p-5">
          <p className="text-xs font-extrabold tracking-wide text-green-800">STRENGTH</p>
          <p className="font-extrabold text-lg text-green-900 mt-1">
            {allTied ? 'All areas are level' : strongest.length ? strongest.map((c) => `${c.name} (${c.correct} of ${c.outOf})`).join(', ') : 'Not available'}
          </p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5">
          <p className="text-xs font-extrabold tracking-wide text-amber-800">FOCUS AREA</p>
          <p className="font-extrabold text-lg text-amber-900 mt-1">
            {allTied ? 'All areas are level' : weakest.length ? weakest.map((c) => `${c.name} (${c.correct} of ${c.outOf})`).join(', ') : 'Not available'}
          </p>
        </div>
      </div>
      {notAssessed.length > 0 && <p className="muted">Not assessed: {notAssessed.map((c) => c.name).join(', ')}.</p>}

      <div className="rounded-3xl bg-brand-soft p-5 flex gap-3">
        <Lightbulb className="text-amber-500 shrink-0" size={24} aria-hidden="true" />
        <div>
          <p className="font-extrabold">Suggested next step</p>
          <p className="mt-1 text-slate-700">{suggestion.text}</p>
          <p className="muted mt-2">Suggestions follow fixed rules on your own answers. They are not a trained AI model and not a test of mastery.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-3">
        <Link to={`${base}/quiz`} className="primary flex-1"><RotateCcw size={18} aria-hidden="true" /> Retake quiz</Link>
        <Link to={base} className="secondary">Review lesson</Link>
        {nextModule && <Link to={`/course/${courseId}/${nextModule.id}`} className="secondary">Next: {nextModule.title} <ArrowRight size={16} aria-hidden="true" /></Link>}
        <Link to="/progress" className="secondary">My progress</Link>
      </div>

      <section className="panel p-5 sm:p-6" aria-labelledby="rev">
        <h3 id="rev" className="font-extrabold text-lg">Question review</h3>
        <ol className="mt-4 space-y-4">
          {attempt.responses.map((r, i) => {
            const q = byId[r.questionId];
            if (!q) return null;
            const skipped = r.answer === null || r.answer === undefined;
            const Icon = skipped ? MinusCircle : r.correct ? CheckCircle2 : XCircle;
            const tone = skipped ? 'text-slate-600' : r.correct ? 'text-green-700' : 'text-red-700';
            const status = skipped ? 'Not answered' : r.correct ? 'Correct' : 'Incorrect';
            return (
              <li key={r.questionId} className="flex gap-3">
                <Icon className={`${tone} shrink-0 mt-1`} size={24} aria-hidden="true" />
                <div className="min-w-0">
                  <p className="font-bold">{i + 1}. {q.text}</p>
                  <p className="text-sm mt-1">
                    <span className={`font-extrabold ${tone}`}>{status}</span>
                    {' · '}{COMPETENCIES[q.competency].name}
                  </p>
                  <p className="text-sm mt-1">Your answer: {skipped ? 'none' : q.options[r.answer]}</p>
                  {!r.correct && <p className="text-sm mt-1">Correct answer: <b>{q.options[q.correct]}</b></p>}
                  <p className="muted mt-1">{q.explanation}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {history.length > 1 && (
        <section className="panel p-5 sm:p-6" aria-labelledby="hist">
          <h3 id="hist" className="font-extrabold text-lg">Attempts for this module</h3>
          <ul className="mt-3 divide-y divide-indigo-50">
            {[...history].reverse().map((h) => {
              const s = moduleSummary(h.responses);
              return (
                <li key={h.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <span>{new Date(h.createdAt).toLocaleString()} &middot; <b>{s.correct}/{s.outOf}</b>{h.id === latestId ? ' (latest)' : ''}</span>
                  {h.id === attempt.id ? <span className="muted">Viewing</span> : <Link className="text-brand underline font-semibold" to={`${base}/results/${h.id}`}>View</Link>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
