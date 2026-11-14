import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';

// Quizzes: deadlines, answer review, per-student results. Scoring happens in the database (submit_learning_quiz).
function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('This action requires an internet connection.');
  return supabase;
}

const QUIZ_FIELDS = 'id,module_id,title,pass_mark,due_at,allow_late,published,created_at';

/* ---------- student ---------- */

export const getQuiz = (quizId) => api().rpc('get_learning_quiz', { p_quiz: quizId }).then(unwrap);

/** answers: { [questionId]: choiceIndex }. Returns score, passed, is_late and the per-question review. */
export const submitQuiz = (quizId, answers) =>
  api().rpc('submit_learning_quiz', { p_quiz: quizId, p_answers: Object.entries(answers).map(([questionId, choice]) => ({ questionId, choice })) }).then(unwrap);

/** The student's attempts at one quiz, newest first. */
export const myAttempts = (quizId) => api().from('learning_quiz_attempts')
  .select('id,score,passed,is_late,submitted_at').eq('quiz_id', quizId).order('submitted_at', { ascending: false }).limit(20).then(unwrap);

export const attemptReview = (attemptId) => api().rpc('quiz_attempt_review', { p_attempt: attemptId }).then(unwrap);

/* ---------- instructor ---------- */

export const listQuizzesAdmin = (moduleId) => api().from('learning_quizzes').select(QUIZ_FIELDS).eq('module_id', moduleId).order('created_at').then(unwrap);

/** Returns a message, or '' when the quiz settings can be saved. */
export function quizError(form) {
  if (!form.title?.trim()) return 'Give the quiz a title.';
  if (form.title.trim().length > 160) return 'Use 160 characters or fewer for the title.';
  const mark = Number(form.pass_mark);
  if (!Number.isInteger(mark) || mark < 0 || mark > 100) return 'The pass mark must be a whole number from 0 to 100.';
  if (form.due_at && Number.isNaN(new Date(form.due_at).getTime())) return 'The deadline is not a valid date.';
  return '';
}

export async function saveQuiz(moduleId, form) {
  const fields = {
    module_id: moduleId,
    title: form.title.trim(),
    pass_mark: Number(form.pass_mark),
    due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
    allow_late: Boolean(form.allow_late),
  };
  const client = api();
  const query = form.id ? client.from('learning_quizzes').update(fields).eq('id', form.id) : client.from('learning_quizzes').insert({ ...fields, published: false });
  return unwrap(await query.select(QUIZ_FIELDS).single());
}

export const setQuizPublished = (id, published) => api().from('learning_quizzes').update({ published }).eq('id', id).select(QUIZ_FIELDS).single().then(unwrap);
export const deleteQuiz = (id) => api().from('learning_quizzes').delete().eq('id', id).then(unwrap);

export const listQuestions = (quizId) => api().from('learning_quiz_questions')
  .select('id,prompt,options,correct_index,competency,difficulty,explanation,position').eq('quiz_id', quizId).order('position').order('id').then(unwrap);

export async function saveQuestion(quizId, row) {
  const fields = {
    quiz_id: quizId,
    prompt: row.prompt.trim(),
    options: row.options.map((o) => o.trim()),
    correct_index: row.correct_index,
    competency: row.competency === '' || row.competency == null ? null : Number(row.competency),
    difficulty: row.difficulty === '' || row.difficulty == null ? null : Number(row.difficulty),
    explanation: (row.explanation || '').trim(),
    position: Number(row.position) || 0,
  };
  const client = api();
  const query = row.id ? client.from('learning_quiz_questions').update(fields).eq('id', row.id) : client.from('learning_quiz_questions').insert(fields);
  return unwrap(await query.select().single());
}

export const deleteQuestion = (id) => api().from('learning_quiz_questions').delete().eq('id', id).then(unwrap);

/** Every enrolled student: attempts, best score, passed, late. */
export const quizResults = (quizId) => api().rpc('quiz_results', { p_quiz: quizId }).then(unwrap);
