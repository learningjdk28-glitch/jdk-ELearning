import { Link, useParams } from 'react-router-dom';
import { useLearner } from '../context/LearnerContext.jsx';
import { loadModule } from '../lib/courseContent.js';
import { attemptsForModule } from '../lib/modules.js';
import ModuleResults from '../components/ModuleResults.jsx';
import { BackHeader, Callout } from '../components/ui.jsx';

export default function ModuleResultsPage() {
  const { courseId, moduleId, attemptId } = useParams();
  const { moduleAttempts } = useLearner();

  let data;
  try {
    data = loadModule(courseId, moduleId);
  } catch (e) {
    return (
      <div className="max-w-6xl mx-auto">
        <BackHeader title="Results" to={`/course/${courseId}`} />
        <Callout tone="bad">These results could not be loaded: {e.message}</Callout>
      </div>
    );
  }

  const history = attemptsForModule(moduleAttempts, moduleId);
  const attempt = history.find((a) => a.id === attemptId);
  if (!attempt) {
    return (
      <div className="max-w-6xl mx-auto">
        <BackHeader title="Results" to={`/course/${courseId}`} />
        <Callout tone="warn">
          This attempt was not found on this device. <Link className="underline font-bold" to={`/course/${courseId}/${moduleId}/quiz`}>Take the quiz</Link>.
        </Callout>
      </div>
    );
  }

  // Use the questions as the learner saw them. Attempts downloaded from the cloud have no snapshot: use current content.
  const questions = attempt.snapshot || data.assessment.questions;
  const nextModule = data.course.modules[data.index + 1] || null;

  return (
    <>
      <BackHeader title={`Results: Module ${data.index + 1}`} to={`/course/${courseId}`} />
      <ModuleResults courseId={courseId} module={data.module} nextModule={nextModule} attempt={attempt} questions={questions} history={history} />
    </>
  );
}
