import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';
import { getMaterials } from './materials.js';

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
export async function loadMyLearning() {
  const client = api();
  const [enrollments, courses, completions, attempts] = await Promise.all([
    client.from('course_enrollments').select('course_id,status').eq('status', 'active').then(unwrap),
    client.from('courses').select('id,title,description,category,level,published').eq('published', true).order('title').then(unwrap),
    client.from('unit_completions').select('unit_id').then(unwrap),
    client.from('learning_quiz_attempts').select('quiz_id,passed').eq('passed', true).then(unwrap),
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

/** One module for the player: pages with optional versions, levels, activities, quizzes, files, glossary. */
export async function loadModule(courseId, moduleId) {
  const client = api();
  const mod = await client.from('learning_modules').select('id,course_id,title,description,position').eq('id', moduleId).eq('course_id', courseId).maybeSingle().then(unwrap);
  if (!mod) return null;
  const [pages, levels, activities, quizzes, materials, glossary, siblings] = await Promise.all([
    client.from('learning_units').select('id,title,kind,content,position').eq('module_id', moduleId).eq('published', true).order('position').then(unwrap),
    client.from('learning_levels').select('id,label,student_label,position,is_default').order('position').then(unwrap),
    client.from('learning_activities').select('id,kind,title,prompt,spec,position').eq('module_id', moduleId).eq('published', true).order('position').then(unwrap),
    client.from('learning_quizzes').select('id,title,pass_mark').eq('module_id', moduleId).eq('published', true).then(unwrap),
    getMaterials(moduleId).then((rows) => rows.filter((f) => f.published)),
    client.from('glossary_terms').select('slug,term,definition,simple,example').eq('course_id', courseId).then(unwrap),
    client.from('learning_modules').select('id,title,position').eq('course_id', courseId).eq('published', true).order('position').then(unwrap),
  ]);
  const pageIds = pages.map((p) => p.id);
  const [variants, completions, attempts] = await Promise.all([
    inList(client.from('learning_unit_variants').select('unit_id,level_id,content'), 'unit_id', pageIds).then(unwrap),
    inList(client.from('unit_completions').select('unit_id'), 'unit_id', pageIds).then(unwrap),
    inList(client.from('learning_quiz_attempts').select('quiz_id,passed,score').eq('passed', true), 'quiz_id', quizzes.map((q) => q.id)).then(unwrap),
  ]);
  return {
    module: { ...mod, pages, quizzes },
    variants, levels, activities, materials, glossary, siblings,
    done: new Set(completions.map((c) => c.unit_id)),
    passed: new Set(attempts.map((a) => a.quiz_id)),
  };
}

/** Records that the signed-in student read a page. Safe to call twice. */
export async function markPageRead(unitId) {
  const client = api();
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Sign in first.');
  const { error } = await client.from('unit_completions').upsert({ unit_id: unitId, user_id: session.user.id }, { onConflict: 'unit_id,user_id', ignoreDuplicates: true });
  if (error) throw new Error(error.message);
}

/** Glossary of every course this student is enrolled in (RLS returns only those). */
export async function loadMyGlossary() {
  const client = api();
  const [terms, courses] = await Promise.all([
    client.from('glossary_terms').select('id,course_id,slug,term,definition,simple,example,category').order('term').then(unwrap),
    client.from('courses').select('id,title').then(unwrap),
  ]);
  const title = new Map(courses.map((c) => [c.id, c.title]));
  return terms.map((t) => ({ ...t, courseTitle: title.get(t.course_id) || t.course_id }));
}
