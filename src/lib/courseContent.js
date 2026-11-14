import { ContentError, parseActivity, parseAssessment, parseCourse, parseLesson } from './contentParse.js';

// One reusable loader for file-based courses. Every file under src/content is bundled at build time
// (eager glob), so lessons and questions are part of the app and are cached for offline use.
const FILES = import.meta.glob('/src/content/**/*.{json,md}', { query: '?raw', import: 'default', eager: true });

function read(path) {
  const raw = FILES[`/src/content/${path}`];
  if (raw === undefined) throw new ContentError(`Missing content file: ${path}`);
  return raw;
}

const cache = new Map();
function memo(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

export const FILE_COURSES = ['networking-basics'];

export function loadCourse(courseId) {
  return memo(`course:${courseId}`, () => parseCourse(read(`${courseId}/course.json`)));
}

export function loadModule(courseId, moduleId) {
  return memo(`module:${courseId}:${moduleId}`, () => {
    const course = loadCourse(courseId);
    const index = course.modules.findIndex((m) => m.id === moduleId);
    if (index < 0) throw new ContentError(`Module ${moduleId} is not part of ${courseId}`);
    const module = course.modules[index];
    const dir = `${courseId}/${module.folder}`;
    return {
      course,
      module,
      index,
      lesson: parseLesson(read(`${dir}/lesson.md`), moduleId),
      assessment: parseAssessment(read(`${dir}/assessment.json`), moduleId),
      activity: parseActivity(read(`${dir}/activity.json`), moduleId),
    };
  });
}

/** Questions of every file-based module, for rebuilding attempts downloaded from the cloud. */
export function findModuleQuestion(questionId) {
  for (const courseId of FILE_COURSES) {
    try {
      for (const m of loadCourse(courseId).modules) {
        const q = loadModule(courseId, m.id).assessment.questions.find((x) => x.id === questionId);
        if (q) return { ...q, moduleId: m.id };
      }
    } catch {
      /* ignore broken content here: the module page reports it */
    }
  }
  return null;
}
