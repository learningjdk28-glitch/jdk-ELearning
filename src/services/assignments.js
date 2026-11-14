import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';
import { fileError, linkError, mimeFor, safeFileName, textError } from '../lib/submissionRules.js';

// Assignments and submissions. RLS and database triggers enforce every rule; these checks only give
// students a clear message before anything is sent.
const BUCKET = 'submissions';
const FIELDS = 'id,course_id,module_id,title,instructions,due_at,allow_late,max_points,submission_types,published,created_at';
const SUB_FIELDS = 'id,assignment_id,user_id,kind,link_url,body,file_path,file_name,file_size,mime_type,submitted_at,is_late,score,feedback,graded_at';

function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const e = new Error('You are offline. Handing in work needs an internet connection.');
    e.offline = true;
    throw e;
  }
  return supabase;
}
async function myId(client) {
  const { data: { session } } = await client.auth.getSession();
  if (!session) throw new Error('Sign in first.');
  return session.user.id;
}
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}${Math.random()}`.replace(/\D/g, '').slice(0, 16));

// ---- Student ----
/** Published assignments of a course with this student's submission for each. */
export async function listCourseAssignments(courseId) {
  const client = api();
  const assignments = await client.from('assignments').select(FIELDS).eq('course_id', courseId).eq('published', true).order('due_at').then(unwrap);
  const subs = assignments.length
    ? await client.from('assignment_submissions').select(SUB_FIELDS).in('assignment_id', assignments.map((a) => a.id)).eq('user_id', await myId(client)).then(unwrap)
    : [];
  return assignments.map((a) => ({ ...a, submission: subs.find((s) => s.assignment_id === a.id) || null }));
}

export async function getAssignment(courseId, id) {
  const client = api();
  const a = await client.from('assignments').select(FIELDS).eq('id', id).eq('course_id', courseId).maybeSingle().then(unwrap);
  if (!a) return null;
  const sub = await client.from('assignment_submissions').select(SUB_FIELDS).eq('assignment_id', id).eq('user_id', await myId(client)).maybeSingle().then(unwrap);
  return { ...a, submission: sub };
}

/** Hands in (or replaces) work. `payload` = { url } | { body } | { file }. */
export async function handIn(assignment, kind, payload, existing) {
  const problem = kind === 'link' ? linkError(payload.url) : kind === 'text' ? textError(payload.body) : fileError(payload.file);
  if (problem) throw new Error(problem);
  const client = api();
  const uid = await myId(client);
  const row = { assignment_id: assignment.id, user_id: uid, kind, link_url: null, body: null, file_path: null, file_name: null, file_size: null, mime_type: null };
  let uploaded = null;
  if (kind === 'link') row.link_url = payload.url.trim();
  if (kind === 'text') row.body = payload.body.trim();
  if (kind === 'file') {
    const file = payload.file;
    uploaded = `${assignment.id}/${uid}/${newId()}-${safeFileName(file.name)}`;
    const { error } = await client.storage.from(BUCKET).upload(uploaded, file, { contentType: mimeFor(file), upsert: false });
    if (error) throw new Error(/exceeded|too large|413/i.test(error.message) ? 'The file is too large for the server limit.' : error.message);
    Object.assign(row, { file_path: uploaded, file_name: file.name.slice(0, 200), file_size: file.size, mime_type: mimeFor(file) });
  }
  const query = existing
    ? client.from('assignment_submissions').update(row).eq('id', existing.id)
    : client.from('assignment_submissions').insert(row);
  const { data, error } = await query.select(SUB_FIELDS).single();
  if (error) {
    if (uploaded) await client.storage.from(BUCKET).remove([uploaded]);
    throw new Error(error.message);
  }
  // The replaced file is no longer referenced: remove it so it does not use storage.
  if (existing?.file_path && existing.file_path !== data.file_path) await client.storage.from(BUCKET).remove([existing.file_path]);
  return data;
}

/** Opens a submitted file through a short-lived signed link (student: own file; instructor: their course). */
export async function openSubmissionFile(path) {
  const { data, error } = await api().storage.from(BUCKET).createSignedUrl(path, 120);
  if (error) throw new Error(error.message);
  window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
}

// ---- Instructor ----
export async function listAssignmentsAdmin(courseId) {
  const client = api();
  const [assignments, enrolled] = await Promise.all([
    client.from('assignments').select(FIELDS).eq('course_id', courseId).order('due_at').then(unwrap),
    client.from('course_enrollments').select('user_id', { count: 'exact', head: true }).eq('course_id', courseId).eq('status', 'active'),
  ]);
  const subs = assignments.length
    ? await client.from('assignment_submissions').select('assignment_id,is_late,score').in('assignment_id', assignments.map((a) => a.id)).then(unwrap)
    : [];
  return {
    enrolled: enrolled.count ?? 0,
    assignments: assignments.map((a) => {
      const mine = subs.filter((s) => s.assignment_id === a.id);
      return { ...a, handedIn: mine.length, late: mine.filter((s) => s.is_late).length, toGrade: mine.filter((s) => s.score == null).length };
    }),
  };
}

export function assignmentError(row) {
  if (!row.title?.trim()) return 'Give the assignment a title.';
  if (row.title.trim().length > 160) return 'Use 160 characters or fewer for the title.';
  if (!row.due_at || Number.isNaN(new Date(row.due_at).getTime())) return 'Set a deadline.';
  if (!(row.max_points >= 1 && row.max_points <= 1000)) return 'Points must be between 1 and 1000.';
  if (!row.submission_types?.length) return 'Allow at least one way to hand in.';
  if ((row.instructions || '').length > 10000) return 'Use 10,000 characters or fewer for the instructions.';
  return '';
}

export async function saveAssignment(courseId, row) {
  const problem = assignmentError(row);
  if (problem) throw new Error(problem);
  const fields = {
    course_id: courseId,
    module_id: row.module_id || null,
    title: row.title.trim(),
    instructions: (row.instructions || '').trim(),
    due_at: new Date(row.due_at).toISOString(),
    allow_late: Boolean(row.allow_late),
    max_points: Number(row.max_points),
    submission_types: row.submission_types,
    published: Boolean(row.published),
  };
  const client = api();
  const query = row.id ? client.from('assignments').update(fields).eq('id', row.id) : client.from('assignments').insert(fields);
  return unwrap(await query.select(FIELDS).single());
}

export const deleteAssignment = (id) => api().from('assignments').delete().eq('id', id).then(unwrap);
export const getAssignmentAdmin = (id) => api().from('assignments').select(FIELDS).eq('id', id).maybeSingle().then(unwrap);
export const assignmentRoster = (id) => api().rpc('assignment_roster', { p_assignment: id }).then(unwrap);

export async function gradeSubmission(id, score, feedback) {
  const value = score === '' || score == null ? null : Number(score);
  if (value != null && (Number.isNaN(value) || value < 0)) throw new Error('Enter a score of 0 or more.');
  const { error } = await api().from('assignment_submissions').update({ score: value, feedback: feedback?.trim() || null }).eq('id', id);
  if (error) throw new Error(error.message);
}

export const storageUsage = (courseId) => api().rpc('storage_usage', { p_course: courseId }).then(unwrap);
