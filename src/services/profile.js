import { displayNameSchema, emailSchema, passwordSchema, profileFieldsSchema } from '../lib/validation.js';
import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';

// Profile and account actions. Every call returns data or throws an Error with a readable message.

const nameSchema = displayNameSchema;

export { passwordSchema };

function need() {
  if (!supabase) throw new Error('Supabase is not configured.');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new Error('You are offline. Connect to the internet and try again.');
  }
}

export async function fetchProfile(userId) {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, role, is_super_admin, student_number, phone, address, school_id, created_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateDisplayName(userId, name) {
  need();
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { data, error } = await supabase
    .from('profiles')
    .update({ display_name: parsed.data })
    .eq('id', userId)
    .select('id, display_name, role')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function changePassword(password) {
  need();
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) throw new Error(error.message);
}

/** Deletes this learner's cloud progress (RPC) and this device's local copy. */
export async function resetMyProgress(userId) {
  need();
  const { error } = await supabase.rpc('reset_my_progress');
  if (error) throw new Error(error.message);
  await db.transaction('rw', db.attempts, db.progress, db.notes, async () => {
    await db.attempts.where('userId').equals(userId).delete();
    await db.progress.where('userId').equals(userId).delete();
    await db.notes.where('userId').equals(userId).delete();
  });
}

const PROFILE_FIELDS = 'id, display_name, role, is_super_admin, student_number, phone, address, school_id, created_at';

/** Saves the signed-in user's own editable fields. Validated here and again by the database. */
export async function updateMyProfile(userId, fields) {
  need();
  const parsed = profileFieldsSchema.safeParse(fields);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { data, error } = await supabase.from('profiles').update(parsed.data).eq('id', userId).select(PROFILE_FIELDS).single();
  if (error) throw new Error(error.message);
  return data;
}

// Admin email list (super administrator only; enforced by RLS).
export async function listAdminEmails() {
  need();
  const { data, error } = await supabase.from('admin_allowlist').select('email, added_at').order('added_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

export async function addAdminEmail(email) {
  need();
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  const { error } = await supabase.from('admin_allowlist').insert({ email: parsed.data.toLowerCase() });
  if (error) throw new Error(/duplicate key/i.test(error.message) ? 'That email is already on the list.' : error.message);
}

export async function removeAdminEmail(email) {
  need();
  const { error } = await supabase.from('admin_allowlist').delete().eq('email', email);
  if (error) throw new Error(error.message);
}
