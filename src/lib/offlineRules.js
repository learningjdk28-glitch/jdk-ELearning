// Offline rules: what counts as "no connection", and how work saved on the device (the outbox)
// is shown on top of the last copy from the server. Pure functions, tested in tests/phase6.test.mjs.

/** Kinds of work the outbox can hold. Files are never queued: they need a connection. */
export const OUTBOX_KINDS = {
  page: 'Page read',
  activity: 'Activity finished',
  quiz: 'Quiz answers',
  pretest: 'Pre-test answers',
  submission: 'Assignment hand-in',
};

/** True when the error means "no connection" (try again later), not "the server said no". */
export function isNetworkError(error, online = typeof navigator === 'undefined' ? true : navigator.onLine) {
  if (online === false) return true;
  if (!error) return false;
  if (error.offline) return true;
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed|err_internet_disconnected|timed? ?out/i.test(String(error.message || error));
}

/** Items still waiting to be sent (failed ones are shown separately and are not applied). */
export const waiting = (items) => (items || []).filter((i) => i.status !== 'failed');

const idsOf = (items, kind, field) => new Set(waiting(items).filter((i) => i.kind === kind).map((i) => i.payload[field]));

/** Dashboard, My Path and the course page: pages read offline count as read; a queued pre-test shows as pending. */
export function overlayLearning(data, items) {
  if (!data) return data;
  const pages = idsOf(items, 'page', 'unitId');
  const pretests = idsOf(items, 'pretest', 'courseId');
  return {
    ...data,
    done: new Set([...data.done, ...pages]),
    courses: data.courses.map((c) => (pretests.has(c.course.id) && c.placement.pretest !== 'done'
      ? { ...c, placement: { ...c.placement, pretest: 'pending' } } : c)),
  };
}

/** Module player: pages and activities done offline, quizzes answered offline (waiting to be scored). */
export function overlayModule(data, items) {
  if (!data) return data;
  return {
    ...data,
    done: new Set([...data.done, ...idsOf(items, 'page', 'unitId')]),
    activitiesDone: new Set([...data.activitiesDone, ...idsOf(items, 'activity', 'activityId')]),
    pendingQuizzes: idsOf(items, 'quiz', 'quizId'),
  };
}

/** The queued quiz attempt for one quiz, if any. While it waits, the quiz cannot be answered again. */
export const pendingQuiz = (items, quizId) => waiting(items).find((i) => i.kind === 'quiz' && i.payload.quizId === quizId) || null;
export const pendingPretest = (items, courseId) => waiting(items).find((i) => i.kind === 'pretest' && i.payload.courseId === courseId) || null;
export const pendingSubmission = (items, assignmentId) => waiting(items).find((i) => i.kind === 'submission' && i.payload.assignmentId === assignmentId) || null;

/** Assignment list: an assignment with a queued hand-in shows "Waiting to sync". */
export const overlayAssignments = (list, items) => (list || []).map((a) => (pendingSubmission(items, a.id) ? { ...a, pending: true } : a));

/** Sends oldest first so a page read before a quiz arrives before it. */
export const sendOrder = (items) => waiting(items).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt));

/** "2 waiting to sync · 1 problem" style summary for the status badge. */
export function outboxSummary(items) {
  const list = items || [];
  const failed = list.filter((i) => i.status === 'failed').length;
  return { pending: list.length - failed, failed, total: list.length };
}
