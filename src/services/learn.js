import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';
import { getMaterials } from './materials.js';
import { currentUserId, enqueue, withCache } from './offline.js';
import { isNetworkError, overlayLearning, overlayModule, pendingPretest } from '../lib/offlineRules.js';

// Student learning data. Row level security limits every query to what this student may see:
// published content of courses they are actively enrolled in.

function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const e = new Error('You are offline. Online courses need an internet connection.');
    e.offline = true;
    throw e;
  }
  return supabase;
}
const inList = (q, col, ids) => (ids.length ? q.in(col, ids) : q.in(col, ['00000000-0000-0000-0000-000000000000']));

/**
 * Everything the dashboard and My Path need, in a fixed number of queries:
 * { courses: [{ course, modules: [{ ...module, pages:[{id,position,title}], quizzes:[{id,title}] }] }],
 *   done: Set<pageId>, passed: Set<quizId>, catalog: courses not enrolled }
 */
export const loadMyLearning = () => withCache('learning', fetchMyLearning, overlayLearning);

async function fetchMyLearning() {
  const client = api();
  const [enrollments, courses, completions, attempts, pretests] = await Promise.all([
    client.from('course_enrollments').select('course_id,status').eq('status', 'active').then(unwrap),
    client.from('courses').select('id,title,description,category,level,published,pretest_published').eq('published', true).order('title').then(unwrap),
    client.from('unit_completions').select('unit_id').then(unwrap),
    client.from('learning_quiz_attempts').select('quiz_id,passed').eq('passed', true).then(unwrap),
    client.from('pretest_attempts').select('course_id,level_id,tested_out,score,submitted_at').eq('stage', 'pre').order('submitted_at', { ascending: false }).then(unwrap),
  ]);
  const enrolledIds = enrollments.map((e) => e.course_id);
  const mine = courses.filter((c) => enrolledIds.includes(c.id));
  const modules = mine.length
    ? await inList(client.from('learning_modules').select('id,course_id,title,description,position').eq('published', true), 'course_id', mine.map((c) => c.id)).order('position').then(unwrap)
    : [];
  const moduleIds = modules.map((m) => m.id);
  const [pages, quizzes] = await Promise.all([
    inList(client.from('learning_units').select('id,module_id,title,position').eq('published', true), 'module_id', moduleIds).order('position').then(unwrap),
    inList(client.from('learning_quizzes').select('id,module_id,title').eq('published', true), 'module_id', moduleIds).then(unwrap),
  ]);
  return {
    courses: mine.map((course) => ({
      course,
      placement: placementFor(course, pretests),
      modules: modules.filter((m) => m.course_id === course.id).map((m) => ({
        ...m,
        pages: pages.filter((p) => p.module_id === m.id),
        quizzes: quizzes.filter((q) => q.module_id === m.id),
      })),
    })),
    done: new Set(completions.map((c) => c.unit_id)),
    passed: new Set(attempts.map((a) => a.quiz_id)),
    catalog: courses.filter((c) => !enrolledIds.includes(c.id)),
  };
}

/** Progress page: learning overview, best quiz scores, pre/post-test attempts, study time, and the class comparison. */
export async function loadMyProgress() {
  const [learning, scores] = await Promise.all([loadMyLearning(), withCache('progress', fetchScores)]);
  const compare = {};
  await Promise.all(learning.courses.map(async ({ course }) => {
    compare[course.id] = await withCache(`compare:${course.id}`, () => api().rpc('course_compare', { p_course: course.id }).then(unwrap)).catch(() => null);
  }));
  return { learning, ...scores, compare };
}

async function fetchScores() {
  const client = api();
  const [attempts, pretests, time] = await Promise.all([
    client.from('learning_quiz_attempts').select('quiz_id,score').then(unwrap),
    client.from('pretest_attempts').select('course_id,stage,score,modules,submitted_at').order('submitted_at').then(unwrap),
    client.from('study_time').select('module_id,day,seconds').then(unwrap),
  ]);
  const best = {};
  for (const a of attempts) best[a.quiz_id] = Math.max(best[a.quiz_id] ?? 0, Math.round(Number(a.score)));
  return { best, pretests, time };
}

/** Placement from the latest pre-test attempt (attempts arrive newest first). */
function placementFor(course, attempts) {
  const latest = attempts.find((a) => a.course_id === course.id) || null;
  return {
    pretest: !course.pretest_published && !latest ? 'none' : latest ? 'done' : 'todo',
    testedOut: new Set(latest?.tested_out || []),
    levelId: latest?.level_id || null,
    score: latest ? Number(latest.score) : null,
  };
}

/** One module for the player: pages with optional versions, levels, activities, quizzes, files, glossary. */
export const loadModule = (courseId, moduleId) => withCache(`module:${courseId}:${moduleId}`, () => fetchModule(courseId, moduleId), overlayModule);

async function fetchModule(courseId, moduleId) {
  const client = api();
  const mod = await client.from('learning_modules').select('id,course_id,title,description,position').eq('id', moduleId).eq('course_id', courseId).maybeSingle().then(unwrap);
  if (!mod) return null;
  const [pages, levels, activities, quizzes, materials, glossary, siblings, placement] = await Promise.all([
    client.from('learning_units').select('id,title,kind,content,position').eq('module_id', moduleId).eq('published', true).order('position').then(unwrap),
    client.from('learning_levels').select('id,label,student_label,position,is_default').order('position').then(unwrap),
    client.from('learning_activities').select('id,kind,title,prompt,spec,position').eq('module_id', moduleId).eq('published', true).order('position').then(unwrap),
    client.from('learning_quizzes').select('id,title,pass_mark,due_at,allow_late').eq('module_id', moduleId).eq('published', true).then(unwrap),
    getMaterials(moduleId).then((rows) => rows.filter((f) => f.published)),
    client.from('glossary_terms').select('slug,term,definition,simple,example').eq('course_id', courseId).then(unwrap),
    client.from('learning_modules').select('id,title,position').eq('course_id', courseId).eq('published', true).order('position').then(unwrap),
    client.from('pretest_attempts').select('level_id').eq('course_id', courseId).eq('stage', 'pre').order('submitted_at', { ascending: false }).limit(1).then(unwrap),
  ]);
  const pageIds = pages.map((p) => p.id);
  const [variants, completions, attempts, activityDone] = await Promise.all([
    inList(client.from('learning_unit_variants').select('unit_id,level_id,content'), 'unit_id', pageIds).then(unwrap),
    inList(client.from('unit_completions').select('unit_id'), 'unit_id', pageIds).then(unwrap),
    inList(client.from('learning_quiz_attempts').select('quiz_id,passed,score').eq('passed', true), 'quiz_id', quizzes.map((q) => q.id)).then(unwrap),
    inList(client.from('activity_completions').select('activity_id'), 'activity_id', activities.map((a) => a.id)).then(unwrap),
  ]);
  return {
    module: { ...mod, pages, quizzes },
    variants, levels, activities, materials, glossary, siblings,
    placementLevel: placement[0]?.level_id || null,
    done: new Set(completions.map((c) => c.unit_id)),
    passed: new Set(attempts.map((a) => a.quiz_id)),
    activitiesDone: new Set(activityDone.map((a) => a.activity_id)),
  };
}

/** Records that the student finished an activity (first time only). Saved on the device first, sent when online. */
export async function completeActivity(activityId, title = '') {
  const uid = await currentUserId();
  return enqueue('activity', { activityId }, { id: `activity:${uid}:${activityId}`, label: title });
}

/** Records that the signed-in student read a page. Safe to call twice. */
/** Records that the signed-in student read a page. Saved on the device first, sent when online. Safe to call twice. */
export async function markPageRead(unitId, title = '') {
  const uid = await currentUserId();
  return enqueue('page', { unitId }, { id: `page:${uid}:${unitId}`, label: title });
}

/** Glossary of every course this student is enrolled in (RLS returns only those). */
export const loadMyGlossary = () => withCache('glossary', fetchMyGlossary);

async function fetchMyGlossary() {
  const client = api();
  const [terms, courses] = await Promise.all([
    client.from('glossary_terms').select('id,course_id,slug,term,definition,simple,example,category').order('term').then(unwrap),
    client.from('courses').select('id,title').then(unwrap),
  ]);
  const title = new Map(courses.map((c) => [c.id, c.title]));
  return terms.map((t) => ({ ...t, courseTitle: title.get(t.course_id) || t.course_id }));
}

/** Pre-test questions (no answers), this student's attempts, and the levels for naming the result. */
export const loadPretest = (courseId) => withCache(`pretest:${courseId}`, () => fetchPretest(courseId),
  (d, items) => ({ ...d, pending: pendingPretest(items, courseId, 'pre'), pendingPost: pendingPretest(items, courseId, 'post') }));

async function fetchPretest(courseId) {
  const client = api();
  const [pretest, attempts, levels] = await Promise.all([
    client.rpc('get_course_pretest', { p_course: courseId }).then(unwrap),
    client.from('pretest_attempts').select('id,stage,score,correct_count,question_count,level_id,start_module_id,tested_out,modules,submitted_at')
      .eq('course_id', courseId).order('submitted_at', { ascending: false }).then(unwrap),
    client.from('learning_levels').select('id,label,student_label,position,is_default,min_score').order('position').then(unwrap),
  ]);
  return { pretest, attempts, levels };
}

/**
 * Graded on the server. clientId makes a repeated submission (double tap, retry) count once.
 * Without a connection the answers are saved on the device and scored later: returns { queued: true }.
 */
export async function submitPretest(courseId, answers, clientId, stage = 'pre', title = '') {
  try {
    return await api().rpc('submit_course_pretest', { p_course: courseId, p_answers: answers, p_stage: stage, p_client_id: clientId }).then(unwrap);
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    await enqueue('pretest', { courseId, answers, stage }, { id: clientId, label: title });
    return { queued: true };
  }
}
