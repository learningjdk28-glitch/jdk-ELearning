import { supabase } from '../lib/supabase.js';
import { db } from '../lib/db.js';
import { COURSE } from '../data/course.js';
import { questionById } from '../data/questions.js';
import { findModuleQuestion } from '../lib/courseContent.js';

// Cloud synchronization. Idempotent by design:
//  - attempts use a client-generated uuid as primary key, so upsert never duplicates
//  - answers and competency results use composite primary keys
// Safe to call repeatedly and from several triggers (login, reconnect, after saving).

const running = new Map();

export function syncUser(userId) {
  if (!supabase || !userId) return Promise.resolve({ ok: false, reason: 'not-configured' });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.resolve({ ok: false, reason: 'offline' });
  }
  if (running.has(userId)) return running.get(userId);
  const job = doSync(userId)
    .catch((error) => ({ ok: false, reason: 'error', message: error?.message || String(error) }))
    .finally(() => running.delete(userId));
  running.set(userId, job);
  return job;
}

async function doSync(userId) {
  const pushed = await push(userId);
  const pulled = await pull(userId);
  return { ok: true, pushed, pulled, at: new Date().toISOString() };
}

function must(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

async function push(userId) {
  let count = 0;

  const attempts = await db.attempts.where('userId').equals(userId).filter((a) => a.synced === 0).toArray();
  for (const a of attempts) {
    // One atomic, idempotent RPC saves the attempt, its answers and its competency results.
    // The database recomputes correctness from the question bank.
    must(
      await supabase.rpc('sync_attempt', {
        p_attempt: {
          id: a.id,
          course_id: a.courseId || COURSE.id,
          lesson_id: a.lessonId,
          kind: a.kind,
          level: a.level,
          created_at: a.createdAt,
          answers: a.responses.map((r) => ({ question_id: r.questionId, selected_index: r.answer ?? null })),
        },
      }),
      'attempt',
    );
    await db.attempts.update(a.id, { synced: 1 });
    count += 1;
  }

  const progress = await db.progress.where('userId').equals(userId).filter((p) => p.synced === 0).toArray();
  for (const p of progress) {
    must(
      await supabase.from('lesson_progress').upsert(
        {
          user_id: userId,
          lesson_id: p.lessonId,
          completed: p.completed,
          completed_at: p.completedAt,
          updated_at: p.updatedAt,
        },
        { onConflict: 'user_id,lesson_id' },
      ),
      'progress',
    );
    await db.progress.update([userId, p.lessonId], { synced: 1 });
    count += 1;
  }

  const notes = await db.notes.where('userId').equals(userId).filter((n) => n.synced !== 1).toArray();
  for (const n of notes) {
    must(
      await supabase.from('lesson_notes').upsert(
        { user_id: userId, lesson_id: n.lessonId, body: n.text, updated_at: n.updatedAt },
        { onConflict: 'user_id,lesson_id' },
      ),
      'notes',
    );
    await db.notes.update([userId, n.lessonId], { synced: 1 });
    count += 1;
  }

  const prefs = await db.prefs.get(userId);
  if (prefs && prefs.synced === 0) {
    must(
      await supabase.from('learning_preferences').upsert(
        { user_id: userId, learning_mode: prefs.mode, updated_at: prefs.updatedAt },
        { onConflict: 'user_id' },
      ),
      'preferences',
    );
    await db.prefs.update(userId, { synced: 1 });
    count += 1;
  }
  return count;
}

// Download cloud records that are missing on this device (new device or cleared browser data).
async function pull(userId) {
  let count = 0;

  const remoteAttempts = must(
    await supabase.from('assessment_attempts').select('*').eq('user_id', userId),
    'pull attempts',
  );
  const localIds = new Set((await db.attempts.where('userId').equals(userId).primaryKeys()) || []);
  const missing = remoteAttempts.filter((a) => !localIds.has(a.id));
  if (missing.length) {
    const answers = must(
      await supabase.from('assessment_answers').select('*').eq('user_id', userId).in('attempt_id', missing.map((a) => a.id)),
      'pull answers',
    );
    for (const a of missing) {
      const responses = answers
        .filter((r) => r.attempt_id === a.id)
        .map((r) => {
          const q = questionById(r.question_id) || findModuleQuestion(r.question_id);
          return {
            questionId: r.question_id,
            competency: q ? q.competency : 0,
            difficulty: q ? q.difficulty : 1,
            answer: r.selected_index,
            correct: r.is_correct,
          };
        });
      await db.attempts.put({
        id: a.id,
        userId,
        kind: a.kind,
        lessonId: a.lesson_id,
        level: a.level,
        courseId: a.course_id,
        responses,
        createdAt: a.created_at,
        synced: 1,
      });
      count += 1;
    }
  }

  const remoteProgress = must(await supabase.from('lesson_progress').select('*').eq('user_id', userId), 'pull progress');
  for (const p of remoteProgress) {
    const local = await db.progress.get([userId, p.lesson_id]);
    if (!local || (p.completed && !local.completed)) {
      await db.progress.put({
        userId,
        lessonId: p.lesson_id,
        completed: p.completed,
        completedAt: p.completed_at,
        updatedAt: p.updated_at,
        synced: 1,
      });
      count += 1;
    }
  }

  const remoteNotes = must(await supabase.from('lesson_notes').select('*').eq('user_id', userId), 'pull notes');
  for (const n of remoteNotes) {
    const local = await db.notes.get([userId, n.lesson_id]);
    if (!local || (local.synced === 1 && local.updatedAt < n.updated_at)) {
      await db.notes.put({ userId, lessonId: n.lesson_id, text: n.body, updatedAt: n.updated_at, synced: 1 });
      count += 1;
    }
  }

  const remotePrefs = must(
    await supabase.from('learning_preferences').select('*').eq('user_id', userId).maybeSingle(),
    'pull preferences',
  );
  if (remotePrefs) {
    const local = await db.prefs.get(userId);
    if (!local || (local.synced === 1 && (!local.updatedAt || local.updatedAt < remotePrefs.updated_at))) {
      await db.prefs.put({ userId, mode: remotePrefs.learning_mode, updatedAt: remotePrefs.updated_at, synced: 1 });
      count += 1;
    }
  }
  return count;
}
