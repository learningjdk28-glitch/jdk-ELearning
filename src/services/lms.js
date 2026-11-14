import { supabase } from '../lib/supabase.js';

function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('This action requires an internet connection.');
  return supabase;
}
export function unwrap({ data, error }) { if (error) throw new Error(error.message); return data; }
export function slugify(text) { return String(text).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }
export const listCourses = () => api().from('courses').select('id,title,description,category,published,level,cover_url,created_at,updated_at').order('created_at', { ascending: false }).then(unwrap);
export const createCourse = (data) => api().from('courses').insert({
  id: slugify(data.id || data.title), title: data.title.trim(), description: data.description.trim(),
  category: data.category.trim() || 'General', level: data.level, published: Boolean(data.published),
}).select().single().then(unwrap);
export const editCourse = (id, fields) => api().from('courses').update(fields).eq('id', id).select().single().then(unwrap);
export async function removeCourse(id) {
 const { count, error } = await api().from('learning_modules').select('id', {count:'exact',head:true}).eq('course_id',id);
 if(error) throw new Error(error.message);
 if(count) throw new Error('Remove the course modules and their materials before deleting this course. You can also unpublish it.');
 return unwrap(await api().from('courses').delete().eq('id',id));
}

export const listModules = (courseId) => {
  let q = api().from('learning_modules').select('id,course_id,title,description,position,published,created_at,updated_at').order('position');
  if (courseId) q = q.eq('course_id', courseId);
  return q.then(unwrap);
};
export const addModule = (fields) => api().from('learning_modules').insert({
  course_id: fields.course_id, title: fields.title.trim(), description: fields.description?.trim() || '',
  position: Number(fields.position) || 0, published: false,
}).select().single().then(unwrap);
export const editModule = (id, fields) => api().from('learning_modules').update(fields).eq('id', id).select().single().then(unwrap);
export async function removeModule(id) {
 const { count, error } = await api().from('learning_materials').select('id',{count:'exact',head:true}).eq('module_id',id);
 if(error) throw new Error(error.message);
 if(count) throw new Error('Delete uploaded materials first, so their private storage files do not become orphaned.');
 return unwrap(await api().from('learning_modules').delete().eq('id',id));
}

export const listUnits = (moduleId) => api().from('learning_units').select('id,module_id,title,content,kind,position,published,updated_at').eq('module_id', moduleId).order('position').then(unwrap);
export const createUnit = (fields) => api().from('learning_units').insert({
  module_id: fields.module_id, title: fields.title.trim(), content: fields.content.trim(),
  kind: fields.kind, position: Number(fields.position) || 0, published: false,
}).select().single().then(unwrap);
export const editUnit = (id, fields) => api().from('learning_units').update(fields).eq('id', id).select().single().then(unwrap);
export const removeUnit = (id) => api().from('learning_units').delete().eq('id', id).then(unwrap);

export const listStudents = () => api().from('profiles').select('id,display_name,role,created_at').order('created_at', { ascending: false }).limit(500).then(unwrap);
export const listEnrollments = (courseId) => {
  let q = api().from('course_enrollments').select('course_id,user_id,status,enrolled_at').order('enrolled_at', { ascending: false }).limit(1000);
  if (courseId) q = q.eq('course_id', courseId);
  return q.then(unwrap);
};
export const setEnrollment = (courseId, userId, status = 'active') => api().from('course_enrollments')
  .upsert({ course_id: courseId, user_id: userId, status }, { onConflict: 'course_id,user_id' }).then(unwrap);
export const revokeEnrollment = (courseId, userId) => api().from('course_enrollments')
  .update({ status: 'revoked' }).eq('course_id', courseId).eq('user_id', userId).then(unwrap);
export const enrollMe = (courseId) => api().rpc('enroll_in_course', { p_course: courseId }).then(unwrap);
export const myEnrollments = () => api().from('course_enrollments').select('course_id,status').then(unwrap);

export const myCompletions = () => api().from('unit_completions').select('unit_id,completed_at').then(unwrap);
export async function setUnitCompleted(unitId, userId, completed) {
  if (completed) return unwrap(await api().from('unit_completions').upsert({ unit_id: unitId, user_id: userId }, { onConflict: 'unit_id,user_id' }));
  return unwrap(await api().from('unit_completions').delete().eq('unit_id', unitId).eq('user_id', userId));
}
export const adminSummary = () => api().rpc('lms_admin_summary').then(unwrap);

export const listQuizzes = (moduleId) => {
 let q=api().from('learning_quizzes').select('id,module_id,title,pass_mark,published,created_at').order('created_at');
 if(moduleId)q=q.eq('module_id',moduleId);
 return q.then(unwrap);
};
export const createQuiz = (fields) => api().from('learning_quizzes').insert({
 module_id:fields.module_id,title:fields.title.trim(),pass_mark:Number(fields.pass_mark),published:false,
}).select().single().then(unwrap);
export const updateQuiz = (id,fields) => api().from('learning_quizzes').update(fields).eq('id',id).select().single().then(unwrap);
export const deleteQuiz = (id) => api().from('learning_quizzes').delete().eq('id',id).then(unwrap);
export const listQuizQuestions = (quizId) => api().from('learning_quiz_questions').select('*').eq('quiz_id',quizId).order('position').then(unwrap);
export const addQuizQuestion = (fields) => api().from('learning_quiz_questions').insert(fields).select().single().then(unwrap);
export const deleteQuizQuestion = (id) => api().from('learning_quiz_questions').delete().eq('id',id).then(unwrap);
export const getStudentQuiz = (id) => api().rpc('get_learning_quiz',{p_quiz:id}).then(unwrap);
export const submitStudentQuiz = (id,answers) => api().rpc('submit_learning_quiz',{p_quiz:id,p_answers:answers}).then(unwrap);
export const listQuizAttempts = (quizId) => {
 let q=api().from('learning_quiz_attempts').select('id,quiz_id,user_id,correct_count,question_count,score,passed,submitted_at').order('submitted_at',{ascending:false}).limit(100);
 if(quizId)q=q.eq('quiz_id',quizId);
 return q.then(unwrap);
};
export const searchStudents = (search = '', limit = 20, offset = 0) => api().rpc('lms_admin_students', {
 p_search:search.trim().slice(0,100),p_limit:limit,p_offset:offset,
}).then(unwrap);
export const myCertificates = () => api().from('lms_certificates').select('id,course_id,course_title,student_name,issued_at').order('issued_at', {ascending:false}).then(unwrap);
export const listCertificates = () => api().from('lms_certificates').select('id,course_id,user_id,course_title,student_name,issued_at').order('issued_at',{ascending:false}).limit(200).then(unwrap);
export const issueCertificate = (courseId) => api().rpc('issue_lms_certificate',{p_course:courseId}).then(unwrap);
export const deleteCertificate = (id) => api().from('lms_certificates').delete().eq('id',id).then(unwrap);
export const courseMetrics = () => api().rpc('lms_admin_course_metrics').then(unwrap);
export const enrollmentPage = (courseId,limit=20,offset=0) => api().rpc('lms_admin_enrollments',{
 p_course:courseId,p_limit:limit,p_offset:offset,
}).then(unwrap);
