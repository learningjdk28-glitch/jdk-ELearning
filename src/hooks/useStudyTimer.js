import { useEffect } from 'react';
import { supabase } from '../lib/supabase.js';
import { currentUserId } from '../services/offline.js';
import { FLUSH_EVERY_MS, TICK_MS, addToBucket, bucketRows, localDay, shouldCount, subtractRows } from '../lib/studyTime.js';

// The bucket lives in localStorage per account, so time studied offline is sent later.
const keyFor = (uid) => `jdk-study-time:${uid}`;
const read = (uid) => { try { return JSON.parse(localStorage.getItem(keyFor(uid)) || '{}'); } catch { return {}; } };
const write = (uid, bucket) => { try { localStorage.setItem(keyFor(uid), JSON.stringify(bucket)); } catch { /* storage blocked: time is not kept */ } };

let sending = false;
/** Sends the saved totals. Safe to call often: at most one request at a time, nothing when empty or offline. */
export async function flushStudyTime() {
  if (sending || !supabase || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
  const uid = await currentUserId();
  if (!uid) return;
  const rows = bucketRows(read(uid));
  if (!rows.length) return;
  sending = true;
  try {
    const { error } = await supabase.rpc('add_study_time', { p_rows: rows });
    if (!error) write(uid, subtractRows(read(uid), rows));
  } finally { sending = false; }
}

/** Counts study time on this module while the page is visible, focused and in use. */
export default function useStudyTimer(moduleId) {
  useEffect(() => {
    if (!moduleId) return undefined;
    let lastInput = Date.now();
    let uid = null;
    currentUserId().then((id) => { uid = id; });
    const onInput = () => { lastInput = Date.now(); };
    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart', 'wheel'];
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));

    const tick = setInterval(() => {
      const now = Date.now();
      if (!uid || !shouldCount({ visible: document.visibilityState === 'visible', focused: document.hasFocus(), lastInputAt: lastInput, now })) return;
      write(uid, addToBucket(read(uid), moduleId, localDay(), TICK_MS / 1000));
    }, TICK_MS);
    const send = setInterval(flushStudyTime, FLUSH_EVERY_MS);
    const onHide = () => { if (document.visibilityState === 'hidden') flushStudyTime(); };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('online', flushStudyTime);
    flushStudyTime(); // leftovers from an earlier visit

    return () => {
      clearInterval(tick); clearInterval(send);
      events.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('online', flushStudyTime);
      flushStudyTime();
    };
  }, [moduleId]);
}
