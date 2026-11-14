import { loadModule, loadMyGlossary, loadPretest } from './learn.js';
import { loadQuizPage } from './quizzes.js';
import { getAssignment, listCourseAssignments } from './assignments.js';
import { cacheInfo, cacheMark } from './offline.js';

const savedKey = (courseId) => `saved:${courseId}`;

/** When this course was last saved for offline use on this device, or null. */
export const courseSavedAt = async (courseId) => (await cacheInfo(savedKey(courseId)))?.savedAt || null;

/**
 * Opens every module, quiz, assignment, the pre-test and the glossary of a course once, so each is kept on the device.
 * `entry` is one course from loadMyLearning(). `onProgress(done, total)` reports progress.
 */
export async function saveCourseOffline(entry, onProgress = () => {}) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('Connect to the internet to save this course for offline use.');
  }
  const courseId = entry.course.id;
  const tasks = [
    ...entry.modules.map((m) => () => loadModule(courseId, m.id)),
    ...entry.modules.flatMap((m) => m.quizzes.map((q) => () => loadQuizPage(q.id))),
    async () => { const list = await listCourseAssignments(courseId); await Promise.all(list.map((a) => getAssignment(courseId, a.id))); },
    () => loadMyGlossary(),
  ];
  if (entry.course.pretest_published) tasks.push(() => loadPretest(courseId));
  let done = 0;
  onProgress(0, tasks.length);
  for (const task of tasks) {
    await task();
    done += 1;
    onProgress(done, tasks.length);
  }
  await cacheMark(savedKey(courseId), true);
  return courseSavedAt(courseId);
}
