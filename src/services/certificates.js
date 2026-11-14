import { supabase } from '../lib/supabase.js';
import { publicOrigin } from '../lib/native.js';
import { unwrap } from './lms.js';
import { DEFAULT_FIELDS, FONT_TYPES, TEMPLATE_TYPES, certificateText, fieldsError, fontFileError, templateFileError, withAllFields } from '../lib/certificateRules.js';
import { checkFont, measureTemplate, renderCertificate, saveFile } from '../lib/certificatePdf.js';

// Certificates: designs, issuing, revoking, verifying, and making the PDF on the device.
const BUCKET = 'certificate-templates';
const CERT_FIELDS = 'id,course_id,user_id,code,course_title,student_name,student_number,instructor_name,issued_at,revoked_at';

function api() {
  if (!supabase) throw new Error('Supabase is not configured. Check your environment variables.');
  if (typeof navigator !== 'undefined' && !navigator.onLine) throw new Error('This needs an internet connection.');
  return supabase;
}
const safeName = (name) => String(name).normalize('NFKD').replace(/[^\w.-]+/g, '-').replace(/-+/g, '-').slice(-80) || 'design';

/* ---------- design ---------- */

export async function getTemplate(courseId) {
  const t = await api().from('certificate_templates').select('*').eq('course_id', courseId).maybeSingle().then(unwrap);
  return t ? { ...t, fields: withAllFields(t.fields) } : null;
}

export async function templateBytes(template, path = template.file_path) {
  const { data, error } = await api().storage.from(BUCKET).download(path);
  if (error) throw new Error(/not found|object/i.test(error.message) ? 'The certificate design file is missing. Ask your instructor to upload it again.' : error.message);
  return new Uint8Array(await data.arrayBuffer());
}

/** Uploads a new design file and keeps the current field layout (or the default one). */
export async function uploadTemplate(courseId, file, current) {
  const problem = templateFileError(file);
  if (problem) throw new Error(problem);
  const kind = TEMPLATE_TYPES[file.type];
  const bytes = new Uint8Array(await file.arrayBuffer());
  let size;
  try { size = await measureTemplate(bytes, kind); } catch { throw new Error('This file could not be read. Export it again from Canva as PDF or PNG.'); }
  const client = api();
  const path = `${courseId}/${crypto.randomUUID ? crypto.randomUUID() : Date.now()}-${safeName(file.name)}`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  const row = { course_id: courseId, file_path: path, file_kind: kind, page_width: size.width, page_height: size.height, fields: current?.fields || DEFAULT_FIELDS };
  const { data, error: saveError } = await client.from('certificate_templates').upsert(row, { onConflict: 'course_id' }).select('*').single();
  if (saveError) { await client.storage.from(BUCKET).remove([path]); throw new Error(saveError.message); }
  if (current?.file_path && current.file_path !== path) await client.storage.from(BUCKET).remove([current.file_path]);
  return { ...data, fields: withAllFields(data.fields) };
}

/** The uploaded font of a design, or null. */
export const templateFontBytes = (template) => (template?.font_path ? templateBytes(template, template.font_path) : Promise.resolve(null));

/** Uploads a .ttf/.otf font for names in other alphabets and keeps it with the design. */
export async function uploadFont(courseId, file, template) {
  const problem = fontFileError(file);
  if (problem) throw new Error(problem);
  const bytes = new Uint8Array(await file.arrayBuffer());
  await checkFont(bytes);
  const ext = String(file.name).split('.').pop().toLowerCase();
  const client = api();
  const path = `${courseId}/font-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}.${ext}`;
  const { error } = await client.storage.from(BUCKET).upload(path, file, { contentType: FONT_TYPES[ext], upsert: false });
  if (error) throw new Error(error.message);
  const { data, error: saveError } = await client.from('certificate_templates').update({ font_path: path }).eq('course_id', courseId).select('*').single();
  if (saveError) { await client.storage.from(BUCKET).remove([path]); throw new Error(saveError.message); }
  if (template?.font_path) await client.storage.from(BUCKET).remove([template.font_path]);
  return { ...data, fields: withAllFields(data.fields) };
}

/** Removes the uploaded font; fields that used it go back to a built-in font. */
export async function removeFont(courseId, template) {
  const fields = template.fields.map((f) => (f.font === 'Custom' ? { ...f, font: 'Helvetica' } : f));
  const client = api();
  const { data, error } = await client.from('certificate_templates').update({ font_path: null, fields }).eq('course_id', courseId).select('*').single();
  if (error) throw new Error(error.message);
  await client.storage.from(BUCKET).remove([template.font_path]);
  return { ...data, fields: withAllFields(data.fields) };
}

export async function saveFields(courseId, fields, hasFont = false) {
  const problem = fieldsError(fields, { hasFont });
  if (problem) throw new Error(problem);
  return api().from('certificate_templates').update({ fields }).eq('course_id', courseId).select('*').single().then(unwrap);
}

/* ---------- issuing ---------- */

export const certificateRoster = (courseId) => api().rpc('certificate_roster', { p_course: courseId }).then(unwrap);
export const issueCertificates = (courseId, userIds) => api().rpc('issue_certificates', { p_course: courseId, p_users: userIds }).then(unwrap);
export const revokeCertificate = (id) => api().rpc('revoke_certificate', { p_id: id }).then(unwrap);
export const getCertificate = (id) => api().from('lms_certificates').select(CERT_FIELDS).eq('id', id).single().then(unwrap);

/* ---------- student ---------- */

export const myCertificates = () => api().from('lms_certificates').select(CERT_FIELDS).order('issued_at', { ascending: false }).then(unwrap);
export const claimCertificate = (courseId) => api().rpc('issue_lms_certificate', { p_course: courseId }).then(unwrap);

/** Anyone, signed in or not: what a code belongs to. */
export async function verifyCertificate(code) {
  if (!supabase) throw new Error('Supabase is not configured.');
  return supabase.rpc('verify_certificate', { p_code: code }).then(unwrap);
}

/** Makes the PDF for one certificate and saves it. */
export async function downloadCertificate(cert) {
  if (cert.revoked_at) throw new Error('This certificate was revoked.');
  const template = await getTemplate(cert.course_id);
  if (!template) throw new Error('The certificate design is missing. Ask your instructor.');
  const [bytes, fontBytes] = await Promise.all([templateBytes(template), templateFontBytes(template)]);
  const pdf = await renderCertificate(template, bytes, certificateText(cert, publicOrigin()), `${cert.course_title} - ${cert.student_name}`, fontBytes);
  saveFile(pdf, `${safeName(`${cert.course_title}-${cert.student_name}`)}-certificate.pdf`);
}
