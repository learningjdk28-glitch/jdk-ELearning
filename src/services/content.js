import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';

// Instructor content: levels, optional page versions, glossary, activities. Permissions are enforced by RLS.
function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('This action requires an internet connection.');
  return supabase;
}

/** Content levels, default level included. Non-default levels are the optional page versions. */
export const listLevels = () => api().from('learning_levels').select('id,label,student_label,position,is_default,min_score').order('position').then(unwrap);

export async function listVariants(unitIds) {
  if (!unitIds.length) return [];
  return unwrap(await api().from('learning_unit_variants').select('unit_id,level_id,content').in('unit_id', unitIds));
}

/** Makes the page's versions match `versions` ({ levelId: text }): saves non-empty ones, removes the rest. */
export async function syncVariants(unitId, versions, levelIds) {
  const client = api();
  for (const levelId of levelIds) {
    const text = (versions[levelId] || '').trim();
    if (text) unwrap(await client.from('learning_unit_variants').upsert({ unit_id: unitId, level_id: levelId, content: text }));
    else unwrap(await client.from('learning_unit_variants').delete().eq('unit_id', unitId).eq('level_id', levelId));
  }
}

export const listActivities = (moduleId) => api().from('learning_activities').select('id,kind,title,prompt,published,position').eq('module_id', moduleId).order('position').then(unwrap);

// ---- Glossary ----
export const GLOSSARY_LIMITS = { term: 80, definition: 2000, simple: 1000, example: 1000, category: 80 };
export const termSlug = (term) => term.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export function glossaryError(row) {
  if (!row.term?.trim()) return 'Enter the term.';
  if (!termSlug(row.term)) return 'The term needs at least one letter or number.';
  if (!row.definition?.trim()) return 'Write a definition.';
  for (const [key, max] of Object.entries(GLOSSARY_LIMITS)) {
    if ((row[key] || '').length > max) return `${key[0].toUpperCase() + key.slice(1)} must be ${max} characters or fewer.`;
  }
  return '';
}

export const listGlossary = (courseId) => api().from('glossary_terms').select('id,course_id,slug,term,definition,simple,example,category,updated_at').eq('course_id', courseId).order('term').then(unwrap);

export async function saveGlossaryTerm(courseId, row) {
  const error = glossaryError(row);
  if (error) throw new Error(error);
  const fields = {
    course_id: courseId,
    slug: termSlug(row.term),
    term: row.term.trim(),
    definition: row.definition.trim(),
    simple: (row.simple || '').trim(),
    example: (row.example || '').trim(),
    category: (row.category || '').trim(),
  };
  const client = api();
  const query = row.id ? client.from('glossary_terms').update(fields).eq('id', row.id) : client.from('glossary_terms').insert(fields);
  const { data, error: dbError } = await query.select().single();
  if (dbError) throw new Error(/duplicate key/i.test(dbError.message) ? `"${fields.term}" is already in this glossary.` : dbError.message);
  return data;
}

export const deleteGlossaryTerm = (id) => api().from('glossary_terms').delete().eq('id', id).then(unwrap);

// ---- Pre-test authoring (course owner) ----
export async function getPretestAdmin(courseId) {
  const client = api();
  const [course, questions, modules] = await Promise.all([
    client.from('courses').select('id,title,pretest_published,pretest_pass_mark').eq('id', courseId).single().then(unwrap),
    client.from('pretest_questions').select('id,module_id,prompt,options,correct_index,competency,difficulty,explanation,position').eq('course_id', courseId).order('position').then(unwrap),
    client.from('learning_modules').select('id,title,position,published').eq('course_id', courseId).order('position').then(unwrap),
  ]);
  return { course, questions, modules };
}

export async function savePretestQuestion(courseId, row) {
  const fields = {
    course_id: courseId,
    module_id: row.module_id,
    prompt: row.prompt.trim(),
    options: row.options.map((o) => o.trim()),
    correct_index: row.correct_index,
    competency: row.competency === '' || row.competency == null ? null : Number(row.competency),
    difficulty: row.difficulty === '' || row.difficulty == null ? null : Number(row.difficulty),
    explanation: (row.explanation || '').trim(),
    position: Number(row.position) || 0,
  };
  const client = api();
  const query = row.id ? client.from('pretest_questions').update(fields).eq('id', row.id) : client.from('pretest_questions').insert(fields);
  return unwrap(await query.select().single());
}

export const deletePretestQuestion = (id) => api().from('pretest_questions').delete().eq('id', id).then(unwrap);

export const setPretestSettings = (courseId, fields) =>
  api().from('courses').update(fields).eq('id', courseId).select('id,pretest_published,pretest_pass_mark').single().then(unwrap);
