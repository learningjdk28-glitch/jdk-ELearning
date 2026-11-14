import { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Lightbulb } from 'lucide-react';
import { COMPETENCIES, DIFFICULTY_LABELS } from '../data/course.js';
import { CompPill } from './ui.jsx';

/**
 * Generic question runner. Calls onSubmit({ [questionId]: optionIndex }).
 * Unanswered questions are allowed but excluded from scoring and reported clearly.
 */
export default function QuizRunner({ questions, onSubmit, submitting = false, showCompetency = true }) {
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState({});
  const q = questions[idx];
  if (!q) return <p>No questions are available.</p>;

  const answeredCount = Object.keys(selected).length;
  const unanswered = questions.length - answeredCount;
  const last = idx === questions.length - 1;

  return (
    <div className="max-w-2xl mx-auto">
      <p className="font-extrabold">Question {idx + 1} of {questions.length}</p>
      <div
        className="bg-indigo-100 h-2.5 rounded-full mt-2 mb-4 overflow-hidden"
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={questions.length}
        aria-valuenow={idx + 1}
      >
        <div className="bg-brand h-2.5 rounded-full" style={{ width: `${((idx + 1) / questions.length) * 100}%` }} />
      </div>

      {showCompetency && (
        <div className="text-center mb-4">
          <span className="inline-block rounded-full bg-brand-soft text-brand font-bold px-5 py-2">
            Competency: {COMPETENCIES[q.competency].name}
          </span>
        </div>
      )}

      <div className="panel p-5 sm:p-6">
        <p className="text-xs text-slate-600 mb-2">{DIFFICULTY_LABELS[q.difficulty]}</p>
        <h2 className="text-xl sm:text-2xl font-extrabold mb-5 leading-snug">{q.text}</h2>
        <div className="space-y-3" role="radiogroup" aria-label={q.text}>
          {q.options.map((option, i) => {
            const active = selected[q.id] === i;
            return (
              <button
                key={option}
                role="radio"
                aria-checked={active}
                onClick={() => setSelected((s) => ({ ...s, [q.id]: i }))}
                className={`w-full text-left flex items-center gap-4 border rounded-2xl p-3.5 ${
                  active ? 'border-green-600 bg-green-50' : 'border-indigo-100 hover:bg-indigo-50'
                }`}
              >
                <span
                  className={`w-10 h-10 shrink-0 rounded-full grid place-items-center font-bold border ${
                    active ? 'bg-green-600 border-green-600 text-white' : 'border-indigo-200 text-navy'
                  }`}
                  aria-hidden="true"
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1 font-medium">{option}</span>
                {active && <Check className="text-green-700 shrink-0" size={22} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </div>

      {showCompetency && (
        <div className="mt-4 rounded-2xl bg-indigo-50 p-4 flex gap-3 text-slate-700">
          <Lightbulb className="text-amber-500 shrink-0" size={22} aria-hidden="true" />
          <p>This question assesses: {COMPETENCIES[q.competency].blurb}</p>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-5" aria-label="Jump to question">
        {questions.map((item, i) => (
          <button
            key={item.id}
            onClick={() => setIdx(i)}
            aria-label={`Question ${i + 1}${selected[item.id] !== undefined ? ', answered' : ''}`}
            aria-current={i === idx ? 'step' : undefined}
            className={`w-11 h-11 rounded-xl text-sm font-bold border ${
              i === idx
                ? 'bg-brand text-white border-brand'
                : selected[item.id] !== undefined
                  ? 'bg-indigo-100 border-indigo-300'
                  : 'bg-white border-indigo-100'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-3 mt-5">
        <button className="secondary col-span-2 !py-3.5" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>
          <ArrowLeft size={18} /> Previous
        </button>
        {last ? (
          <button className="primary col-span-3" disabled={answeredCount === 0 || submitting} onClick={() => onSubmit(selected)}>
            {submitting ? 'Saving...' : `Submit answers (${answeredCount}/${questions.length})`}
          </button>
        ) : (
          <button className="primary col-span-3" onClick={() => setIdx(idx + 1)}>
            Next <ArrowRight size={18} />
          </button>
        )}
      </div>
      {last && unanswered > 0 && (
        <p className="muted mt-3">
          {unanswered} question{unanswered === 1 ? ' is' : 's are'} unanswered. Unanswered questions are not scored and
          may leave a competency with insufficient evidence.
        </p>
      )}
    </div>
  );
}
