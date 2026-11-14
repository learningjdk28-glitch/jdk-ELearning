import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useLearner } from '../context/LearnerContext.jsx';
import { loadModule } from '../lib/courseContent.js';
import { gradeResponses } from '../lib/scoring.js';
import { MODULE_KIND, makeSnapshot } from '../lib/modules.js';
import QuizRunner from '../components/QuizRunner.jsx';
import { BackHeader, Callout } from '../components/ui.jsx';

export default function ModuleQuiz() {
  const { courseId, moduleId } = useParams();
  const { submitAttempt } = useLearner();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  let data;
  try {
    data = loadModule(courseId, moduleId);
  } catch (e) {
    return (
      <div className="max-w-6xl mx-auto">
        <BackHeader title="Quiz" to={`/course/${courseId}`} />
        <Callout tone="bad">This quiz could not be loaded: {e.message}</Callout>
      </div>
    );
  }
  const { module, index, assessment } = data;

  async function onSubmit(selected) {
    setBusy(true);
    setError('');
    try {
      const responses = gradeResponses(assessment.questions, selected);
      const attempt = await submitAttempt({
        kind: MODULE_KIND,
        lessonId: module.id,
        courseId,
        level: null,
        responses,
        assessmentVersion: assessment.version,
        snapshot: makeSnapshot(assessment.questions),
      });
      navigate(`/course/${courseId}/${module.id}/results/${attempt.id}`);
    } catch {
      setError('Your answers could not be saved on this device. Please try again.');
      setBusy(false);
    }
  }

  return (
    <>
      <BackHeader title={`Quiz: Module ${index + 1}`} to={`/course/${courseId}/${module.id}`} />
      <p className="text-slate-600 mb-4">{module.title}. Twelve questions, three for each competency. Your answers are graded on this device.</p>
      {error && <div className="mb-4"><Callout tone="bad">{error}</Callout></div>}
      <QuizRunner key={module.id} questions={assessment.questions} onSubmit={onSubmit} submitting={busy} />
    </>
  );
}
