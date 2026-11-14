import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HelpCircle } from 'lucide-react';
import { useLearner } from '../context/LearnerContext.jsx';
import { DIAGNOSTIC_QUESTIONS } from '../data/questions.js';
import { gradeResponses } from '../lib/scoring.js';
import QuizRunner from '../components/QuizRunner.jsx';
import { BackHeader, Callout } from '../components/ui.jsx';

export default function PreTest() {
  const { hasDiagnostic, submitAttempt, diagnostic } = useLearner();
  const navigate = useNavigate();
  const [retake, setRetake] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(selected) {
    setBusy(true);
    setError('');
    try {
      const responses = gradeResponses(DIAGNOSTIC_QUESTIONS, selected);
      await submitAttempt({ kind: 'diagnostic', lessonId: null, level: null, responses });
      navigate('/results');
    } catch {
      setError('Your answers could not be saved on this device. Please try again.');
      setBusy(false);
    }
  }

  if (hasDiagnostic && !retake) {
    return (
      <>
        <BackHeader title="Pre-Test" to="/dashboard" />
        <div className="panel p-6 sm:p-8">
          <p>You completed the pre-test on {new Date(diagnostic.createdAt).toLocaleString()}.</p>
          <div className="flex flex-wrap gap-3 mt-5">
            <Link to="/results" className="primary">View my results</Link>
            <button className="secondary" onClick={() => setRetake(true)}>Retake the pre-test</button>
          </div>
          <p className="muted mt-4">Retaking replaces your baseline. Earlier attempts stay in your history.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <BackHeader
        title="Pre-Test"
        to="/dashboard"
        right={<span title="Sixteen questions, four per competency. This sets your starting level." aria-label="Sixteen questions, four per competency. This sets your starting level."><HelpCircle size={26} /></span>}
      />
      {error && <div className="mb-4"><Callout tone="bad">{error}</Callout></div>}
      <QuizRunner questions={DIAGNOSTIC_QUESTIONS} onSubmit={onSubmit} submitting={busy} />
    </>
  );
}
