import Dexie from 'dexie';
import { DEFAULT_MODE } from '../data/course.js';

// Every record carries userId so accounts on a shared device never mix progress.
// "synced" is 0 or 1 (booleans cannot be indexed in IndexedDB).
export const db = new Dexie('navi-learn-v2');

db.version(1).stores({
  attempts: 'id, userId, kind, lessonId, createdAt, synced',
  progress: '[userId+lessonId], userId, synced',
  prefs: 'userId',
  notes: '[userId+lessonId], userId',
});

// v2: notes carry a synced flag so they can upload to lesson_notes.
db.version(2).stores({
  attempts: 'id, userId, kind, lessonId, createdAt, synced',
  progress: '[userId+lessonId], userId, synced',
  prefs: 'userId',
  notes: '[userId+lessonId], userId, synced',
});

const newId = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

export async function getAttempts(userId) {
  const rows = await db.attempts.where('userId').equals(userId).toArray();
  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveAttempt(
  userId,
  { kind, lessonId = null, level = null, responses, courseId = null, assessmentVersion = null, snapshot = null },
) {
  const attempt = {
    id: newId(),
    userId,
    kind,
    lessonId,
    level,
    responses,
    courseId,
    assessmentVersion,
    snapshot,
    createdAt: new Date().toISOString(),
    synced: 0,
  };
  await db.attempts.put(attempt);
  return attempt;
}

export async function getProgress(userId) {
  const rows = await db.progress.where('userId').equals(userId).toArray();
  return Object.fromEntries(rows.map((r) => [r.lessonId, r]));
}

export async function markLessonComplete(userId, lessonId) {
  const existing = await db.progress.get([userId, lessonId]);
  if (existing?.completed) return existing;
  const now = new Date().toISOString();
  const row = { userId, lessonId, completed: true, completedAt: now, updatedAt: now, synced: 0 };
  await db.progress.put(row);
  return row;
}

export async function getPrefs(userId) {
  return (await db.prefs.get(userId)) || { userId, mode: DEFAULT_MODE, updatedAt: null, synced: 1 };
}

export async function setMode(userId, mode) {
  const row = { userId, mode, updatedAt: new Date().toISOString(), synced: 0 };
  await db.prefs.put(row);
  return row;
}

export async function getNote(userId, lessonId) {
  return (await db.notes.get([userId, lessonId]))?.text || '';
}

export async function saveNote(userId, lessonId, text) {
  await db.notes.put({ userId, lessonId, text, updatedAt: new Date().toISOString(), synced: 0 });
}

export async function countPending(userId) {
  const [a, p, f, n] = await Promise.all([
    db.attempts.where('userId').equals(userId).filter((r) => r.synced === 0).count(),
    db.progress.where('userId').equals(userId).filter((r) => r.synced === 0).count(),
    db.prefs.where('userId').equals(userId).filter((r) => r.synced === 0).count(),
    db.notes.where('userId').equals(userId).filter((r) => r.synced !== 1).count(),
  ]);
  return a + p + f + n;
}
