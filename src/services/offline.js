import Dexie, { liveQuery } from 'dexie';
import { supabase } from '../lib/supabase.js';
import { isNetworkError, sendOrder } from '../lib/offlineRules.js';

// Offline support for database content.
//  - cache: the last copy of each screen this student opened, per account (accounts on a shared device never mix).
//  - outbox: work done without a connection, sent oldest first when the device is back online.
// Every outbox item has a client id, and the database ignores a second copy, so retries never count twice.
export const store = new Dexie('jdk-learn-offline');
store.version(1).stores({
  cache: '[userId+key], userId',
  outbox: 'id, userId, createdAt',
});

export const newClientId = () => (typeof crypto !== 'undefined' && crypto.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  }));

// IndexedDB can be unavailable (private windows, blocked storage). The app then works online only.
const safe = async (fn, fallback) => { try { return await fn(); } catch { return fallback; } };

export async function currentUserId() {
  if (!supabase) return null;
  return safe(async () => (await supabase.auth.getSession()).data.session?.user?.id || null, null);
}

export async function outboxItems(userId) {
  const uid = userId ?? await currentUserId();
  if (!uid) return [];
  return safe(() => store.outbox.where('userId').equals(uid).toArray(), []);
}

/**
 * Loads from the server and keeps a copy on the device. Without a connection, returns the saved copy.
 * `overlay(data, outboxItems)` adds work that is still waiting to be sent.
 */
export async function withCache(key, loader, overlay) {
  const uid = await currentUserId();
  let data;
  try {
    data = await loader();
    if (uid) await safe(() => store.cache.put({ userId: uid, key, data, savedAt: new Date().toISOString() }));
  } catch (error) {
    if (!uid || !isNetworkError(error)) throw error;
    const hit = await safe(() => store.cache.get([uid, key]), null);
    if (!hit) {
      const e = new Error('You are offline, and this has not been opened on this device yet. Open it once with a connection and it will work offline after that.');
      e.offline = true;
      throw e;
    }
    data = hit.data;
  }
  return overlay ? overlay(data, await outboxItems(uid)) : data;
}

export const cacheInfo = async (key) => {
  const uid = await currentUserId();
  return uid ? safe(() => store.cache.get([uid, key]), null) : null;
};
export const cacheMark = async (key, data) => {
  const uid = await currentUserId();
  if (uid) await safe(() => store.cache.put({ userId: uid, key, data, savedAt: new Date().toISOString() }));
};

/** Saves work on the device and sends it as soon as possible. `id` makes a repeat (same page read twice) one item. */
export async function enqueue(kind, payload, { id, label } = {}) {
  const uid = await currentUserId();
  if (!uid) throw new Error('Sign in first.');
  const item = { id: id || newClientId(), userId: uid, kind, payload, label: label || '', createdAt: new Date().toISOString(), status: 'pending', error: null, tries: 0 };
  try { await store.outbox.put(item); } catch {
    throw new Error('This device could not save your work (storage is blocked or full). Connect to the internet and try again.');
  }
  flushSoon();
  return item;
}

function must(result) {
  if (result.error) throw Object.assign(new Error(result.error.message), { code: result.error.code });
  return result.data;
}

const SEND = {
  page: async (p, uid) => must(await supabase.from('unit_completions').upsert({ unit_id: p.unitId, user_id: uid }, { onConflict: 'unit_id,user_id', ignoreDuplicates: true })),
  activity: async (p) => must(await supabase.rpc('complete_activity', { p_activity: p.activityId })),
  quiz: async (p, uid, id) => must(await supabase.rpc('submit_quiz', { p_quiz: p.quizId, p_answers: p.answers, p_client_id: id })),
  pretest: async (p, uid, id) => must(await supabase.rpc('submit_course_pretest', { p_course: p.courseId, p_answers: p.answers, p_stage: p.stage || 'pre', p_client_id: id })),
  // Links and written answers only: files are never queued.
  submission: async (p, uid, id) => {
    const already = must(await supabase.from('assignment_submissions').select('id').eq('client_id', id).maybeSingle());
    if (already) return already;
    const existing = must(await supabase.from('assignment_submissions').select('id,file_path').eq('assignment_id', p.assignmentId).eq('user_id', uid).maybeSingle());
    const row = {
      assignment_id: p.assignmentId, user_id: uid, kind: p.kind, client_id: id,
      link_url: p.kind === 'link' ? p.url : null, body: p.kind === 'text' ? p.body : null,
      file_path: null, file_name: null, file_size: null, mime_type: null,
    };
    const query = existing ? supabase.from('assignment_submissions').update(row).eq('id', existing.id) : supabase.from('assignment_submissions').insert(row);
    const saved = must(await query.select('id').single());
    if (existing?.file_path) await supabase.storage.from('submissions').remove([existing.file_path]);
    return saved;
  },
};

let flushing = null;
/** Sends waiting work, oldest first. Stops at the first connection problem; a refusal marks that item as failed. */
export function flush() {
  if (flushing) return flushing;
  flushing = (async () => {
    const uid = await currentUserId();
    if (!uid || !supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) return { sent: 0 };
    let sent = 0;
    for (const item of sendOrder(await outboxItems(uid))) {
      try {
        const result = await SEND[item.kind](item.payload, uid, item.id);
        await safe(() => store.outbox.delete(item.id));
        sent += 1;
        window.dispatchEvent(new CustomEvent('jdk-synced', { detail: { item, result } }));
      } catch (error) {
        if (isNetworkError(error)) break;
        await safe(() => store.outbox.update(item.id, { status: 'failed', error: error.message, tries: item.tries + 1 }));
      }
    }
    return { sent };
  })().finally(() => { flushing = null; });
  return flushing;
}

let timer = null;
function flushSoon() { clearTimeout(timer); timer = setTimeout(() => { flush(); }, 300); }

export async function retryItem(id) {
  await safe(() => store.outbox.update(id, { status: 'pending', error: null }));
  return flush();
}
export const discardItem = (id) => safe(() => store.outbox.delete(id));

/** Calls `onChange(items)` with this account's outbox now and after every change. Returns unsubscribe. */
export function watchOutbox(userId, onChange) {
  if (!userId) { onChange([]); return () => {}; }
  const sub = liveQuery(() => store.outbox.where('userId').equals(userId).toArray()).subscribe({ next: onChange, error: () => onChange([]) });
  return () => sub.unsubscribe();
}

/** Sends waiting work on start, when the connection returns, when the app comes back to the front, and every minute. */
export function startAutoSync() {
  const run = () => { flush(); };
  const onVisible = () => { if (document.visibilityState === 'visible') run(); };
  window.addEventListener('online', run);
  document.addEventListener('visibilitychange', onVisible);
  const every = setInterval(run, 60000);
  run();
  return () => {
    window.removeEventListener('online', run);
    document.removeEventListener('visibilitychange', onVisible);
    clearInterval(every);
  };
}
