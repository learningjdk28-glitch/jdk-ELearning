import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BarChart3, Trophy } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { levelForScore, strengthsAndWeaknesses } from '../lib/scoring.js';
import { BackHeader, Callout, CompetencyBars, LevelBadge } from '../components/ui.jsx';

export default function Results() {
  const { hasDiagnostic, baseline, next } = useLearner();
  if (!hasDiagnostic) return <Navigate to="/pretest" replace />;
  const { strengths, weaknesses, insufficient, relative } = strengthsAndWeaknesses(baseline);

  return (
    <div className="max-w-6xl mx-auto">
      <BackHeader title="Your Competency Profile" to="/dashboard" />
      <div className="text-center my-4">
        <Trophy className="mx-auto text-amber-500" size={72} aria-hidden="true" />
        <h2 className="text-3xl font-extrabold mt-3">Pre-Test Complete!</h2>
        <p className="text-slate-600 mt-2 text-lg">Here is your performance across the four competency areas.</p>
        <p className="muted mt-1">Each score is correct answers divided by answered questions.</p>
      </div>

      <CompetencyBars stats={baseline} title="Pre-test scores" />

      {insufficient.length > 0 && (
        <div className="mt-4">
          <Callout tone="warn">
            Insufficient evidence for: {insufficient.map((s) => s.name).join(', ')}. Answer more questions for a reliable
            score. Standard level is used until then.
          </Callout>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4 mt-4">
        <div className="rounded-3xl bg-green-50 p-5">
          <p className="text-xs font-extrabold tracking-wide text-green-800">STRENGTH</p>
          <p className="font-extrabold text-lg text-green-900 mt-1">
            {strengths.length ? strengths.map((s) => `${s.name} (${s.score}%)`).join(', ') : 'None at 80% or more yet'}
          </p>
        </div>
        <div className="rounded-3xl bg-amber-50 p-5">
          <p className="text-xs font-extrabold tracking-wide text-amber-800">FOCUS AREA</p>
          <p className="font-extrabold text-lg text-amber-900 mt-1">
            {weaknesses.length
              ? weaknesses.map((s) => `${s.name} (${s.score}%, ${levelForScore(s.score, s.sufficient)} level)`).join(', ')
              : 'None below 50%'}
          </p>
        </div>
      </div>
      {relative && <p className="muted mt-2">Shown as the relative highest and lowest because no score crossed a threshold.</p>}

      <div className="rounded-3xl bg-brand-soft p-5 mt-4 flex gap-4">
        <div className="tile bg-amber-100 text-amber-700"><BarChart3 size={24} aria-hidden="true" /></div>
        <div>
          <h3 className="font-extrabold text-lg">Your Learning Path is Ready!</h3>
          {next ? (
            <p className="mt-1 text-slate-700">
              We will start with <b>{next.lesson.title}</b> at the <LevelBadge level={next.level} /> because it builds your area with the
              most room to grow, using your preferred learning mode.
            </p>
          ) : (
            <p className="mt-1">You have completed all lessons.</p>
          )}
          <p className="muted mt-2">
            Below 50% is Foundational, 50% to 79% Standard, 80% or more Advanced. These are fixed rules, not a trained AI model.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mt-6">
        <Link to="/path" className="primary flex-1 text-lg !py-4">Start My Learning Path <ArrowRight size={20} /></Link>
        <Link to="/pretest" className="secondary">Retake pre-test</Link>
      </div>
    </div>
  );
}
