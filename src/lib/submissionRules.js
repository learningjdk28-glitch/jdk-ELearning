// Assignment submission rules shared by the student form, the instructor screens and tests.
// MAX_SUBMISSION_BYTES must equal public.max_submission_bytes() and the "submissions" bucket limit
// (supabase/migrations/20261118a_phase5_assignments.sql); tests/phase5.test.mjs fails if they differ.
export const MAX_SUBMISSION_BYTES = 50 * 1024 * 1024;
/** Supabase free plan: total file storage for the whole project. */
export const PLAN_STORAGE_BYTES = 1024 * 1024 * 1024;

/** File types students may upload. Must match the bucket's allowed MIME types. */
export const SUBMISSION_FILE_TYPES = [
  { mime: 'application/pdf', ext: ['pdf'], label: 'PDF' },
  { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: ['docx'], label: 'Word' },
  { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: ['pptx'], label: 'PowerPoint' },
  { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: ['xlsx'], label: 'Excel' },
  { mime: 'text/plain', ext: ['txt'], label: 'Text' },
  { mime: 'image/png', ext: ['png'], label: 'PNG' },
  { mime: 'image/jpeg', ext: ['jpg', 'jpeg'], label: 'JPEG' },
  { mime: 'image/webp', ext: ['webp'], label: 'WebP' },
  { mime: 'image/gif', ext: ['gif'], label: 'GIF' },
  { mime: 'video/mp4', ext: ['mp4'], label: 'MP4 video' },
  { mime: 'video/webm', ext: ['webm'], label: 'WebM video' },
  { mime: 'video/quicktime', ext: ['mov'], label: 'MOV video' },
];
export const ACCEPT_ATTR = SUBMISSION_FILE_TYPES.flatMap((t) => t.ext.map((e) => `.${e}`)).join(',');

/** How students can hand in. Links come first: they are the recommended way to share videos. */
export const SUBMISSION_KINDS = [
  { id: 'link', label: 'Link', hint: 'Recommended for videos: upload to YouTube or Google Drive, then paste the share link.' },
  { id: 'file', label: 'Upload a file', hint: `Documents, images or short videos, up to ${formatBytes(MAX_SUBMISSION_BYTES)}.` },
  { id: 'text', label: 'Write an answer', hint: 'Type your answer here.' },
];

export function formatBytes(n) {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** Checked BEFORE uploading, so a student never waits for an upload that will be rejected. */
export function fileError(file) {
  if (!file) return 'Choose a file.';
  if (file.size === 0) return 'This file is empty.';
  if (file.size > MAX_SUBMISSION_BYTES) {
    const isVideo = /^video\//.test(file.type) || /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name);
    return `This file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_SUBMISSION_BYTES)}.`
      + (isVideo ? ' For videos, upload to YouTube or Google Drive and hand in the link instead.' : ' Try compressing it or saving it as a PDF.');
  }
  const ext = file.name.split('.').pop().toLowerCase();
  const type = SUBMISSION_FILE_TYPES.find((t) => t.mime === file.type) || SUBMISSION_FILE_TYPES.find((t) => t.ext.includes(ext));
  if (!type) return `This type of file (.${ext}) is not accepted. Use ${SUBMISSION_FILE_TYPES.map((t) => t.label).join(', ')}.`;
  return '';
}

/** The MIME type to store for a file (browsers sometimes leave file.type empty). */
export function mimeFor(file) {
  if (SUBMISSION_FILE_TYPES.some((t) => t.mime === file.type)) return file.type;
  const ext = file.name.split('.').pop().toLowerCase();
  return SUBMISSION_FILE_TYPES.find((t) => t.ext.includes(ext))?.mime || 'application/octet-stream';
}

export function linkError(url) {
  if (!url?.trim()) return 'Paste the link.';
  if (!/^https:\/\/\S+$/i.test(url.trim())) return 'Use a secure link that starts with https://';
  return '';
}

export function textError(body) {
  if (!body?.trim()) return 'Write your answer.';
  if (body.length > 10000) return 'Use 10,000 characters or fewer.';
  return '';
}

/** Safe storage file name: keeps letters, digits, dot, dash, underscore. */
export const safeFileName = (name) => name.normalize('NFKD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-120) || 'file';

/** Student-facing status of an assignment. */
export function submissionStatus(assignment, submission, now = new Date()) {
  const due = new Date(assignment.due_at);
  if (submission?.score != null) return { id: 'graded', label: `Graded: ${Number(submission.score)} / ${assignment.max_points}`, tone: 'success' };
  if (submission) return submission.is_late ? { id: 'late', label: 'Submitted late', tone: 'warning' } : { id: 'on-time', label: 'Submitted on time', tone: 'success' };
  if (now > due) return assignment.allow_late ? { id: 'overdue', label: 'Overdue — late work accepted', tone: 'warning' } : { id: 'closed', label: 'Closed — deadline passed', tone: 'danger' };
  return { id: 'open', label: 'Not submitted yet', tone: 'muted' };
}

/** "Due in 3 days", "Due in 5 hours", "Was due 2 days ago". */
/** 'none' (no deadline), 'open', 'late' (past due, late work accepted) or 'closed'. */
export function deadlineState(dueAt, allowLate = true, now = new Date()) {
  if (!dueAt) return 'none';
  if (now <= new Date(dueAt)) return 'open';
  return allowLate ? 'late' : 'closed';
}

/** An ISO time as the value of a datetime-local input, in the viewer's time zone. */
export function toLocalInput(iso) {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function dueLabel(dueAt, now = new Date()) {
  const ms = new Date(dueAt) - now;
  const abs = Math.abs(ms);
  const unit = abs >= 86400000 ? ['day', 86400000] : abs >= 3600000 ? ['hour', 3600000] : ['minute', 60000];
  const n = Math.max(1, Math.round(abs / unit[1]));
  const text = `${n} ${unit[0]}${n === 1 ? '' : 's'}`;
  return ms >= 0 ? `Due in ${text}` : `Was due ${text} ago`;
}
