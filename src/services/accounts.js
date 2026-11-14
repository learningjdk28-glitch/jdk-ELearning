import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';

// Accounts, invitations and course rosters. The database checks every permission;
// invitation emails are sent by the invite-users Edge Function (it holds the service key).
function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('This action requires an internet connection.');
  return supabase;
}

export const searchAccounts = (search = '', limit = 20, offset = 0) =>
  api().rpc('lms_admin_students', { p_search: search.trim().slice(0, 100), p_limit: limit, p_offset: offset }).then(unwrap);

export const setRole = (userId, role) => api().from('profiles').update({ role }).eq('id', userId).then(unwrap);

/** rows: [{ email, name }]. role: 'learner' | 'admin'. Returns { queued, skipped }. */
export const queueInvites = (rows, role, courseIds) =>
  api().rpc('queue_invites', { p_rows: rows, p_role: role, p_courses: courseIds }).then(unwrap);

export const listInvites = (status = 'all', limit = 50, offset = 0) =>
  api().rpc('list_invites', { p_status: status, p_limit: limit, p_offset: offset }).then(unwrap);

export const inviteStats = () => api().rpc('invite_stats').then(unwrap);
export const cancelInvite = (id) => api().rpc('cancel_invite', { p_id: id }).then(unwrap);

/** Sends one invitation. Returns { status: 'sent' | 'enrolled' | 'waiting' | 'failed', nextAt?, error? }. */
export async function sendInvite(id, resend = false) {
  const { data, error } = await api().functions.invoke('invite-users', { body: { inviteId: id, resend } });
  if (error) {
    // A non-2xx reply carries the message in its body.
    let message = data?.error;
    if (!message && error.context?.json) message = (await error.context.json().catch(() => null))?.error;
    if (!message && /failed to send|fetch|404/i.test(error.message)) message = 'The invite-users Edge Function is not deployed yet. See the setup steps.';
    throw new Error(message || error.message);
  }
  return data;
}

/**
 * Sends queued invitations one by one until the list is done or the hourly budget is used up.
 * onProgress({ done, total, last }) after each one. Returns { done, waiting, nextAt }.
 */
export async function runInviteQueue(ids, onProgress = () => {}, shouldStop = () => false) {
  let done = 0;
  for (const id of ids) {
    if (shouldStop()) break;
    let result;
    // A thrown error is a setup or connection problem: stop, the invitations stay queued.
    try { result = await sendInvite(id); } catch (e) { return { done, waiting: ids.length - done, nextAt: null, error: e.message }; }
    if (result.status === 'waiting') return { done, waiting: ids.length - done, nextAt: result.nextAt || null };
    done += 1;
    onProgress({ done, total: ids.length, last: result });
  }
  return { done, waiting: ids.length - done, nextAt: null };
}

/** Everyone enrolled in a course: invited (never signed in) or active, with pages read. */
export const courseRoster = (courseId) => api().rpc('course_roster', { p_course: courseId }).then(unwrap);

/** Course analytics for the instructor (engagement, pre/post, modules, hardest questions). */
export const courseAnalytics = (courseId) => api().rpc('course_analytics', { p_course: courseId }).then(unwrap);
