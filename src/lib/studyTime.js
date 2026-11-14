// Study-time rules. Time counts only while the page is visible, focused and in use; totals are kept per module
// per day on the device and sent every few minutes (never one database row per tick).

export const TICK_MS = 15_000;
export const IDLE_AFTER_MS = 120_000;
export const FLUSH_EVERY_MS = 300_000;
/** Same as public.study_time_chunk_max(): the most seconds one row of one call may add. */
export const STUDY_CHUNK_MAX = 14_400;

/** The device's local calendar day, 'YYYY-MM-DD'. */
export function localDay(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** True when a tick should count: visible, focused, and some input in the last IDLE_AFTER_MS. */
export const shouldCount = ({ visible, focused, lastInputAt, now }) => Boolean(visible && focused && now - lastInputAt <= IDLE_AFTER_MS);

/** bucket: { "moduleId|day": seconds }. Returns a new bucket. */
export function addToBucket(bucket, moduleId, day, seconds) {
  const key = `${moduleId}|${day}`;
  return { ...bucket, [key]: (bucket[key] || 0) + Math.max(0, Math.round(seconds)) };
}

/** Rows for add_study_time: large totals are split so no row exceeds STUDY_CHUNK_MAX; at most `limit` rows. */
export function bucketRows(bucket, limit = 50) {
  const rows = [];
  for (const [key, total] of Object.entries(bucket)) {
    const [moduleId, day] = key.split('|');
    for (let left = total; left > 0 && rows.length < limit; left -= STUDY_CHUNK_MAX) {
      rows.push({ moduleId, day, seconds: Math.min(left, STUDY_CHUNK_MAX) });
    }
  }
  return rows;
}

/** What is left in the bucket after `rows` were saved (new seconds recorded meanwhile are kept). */
export function subtractRows(bucket, rows) {
  const next = { ...bucket };
  for (const r of rows) {
    const key = `${r.moduleId}|${r.day}`;
    next[key] = (next[key] || 0) - r.seconds;
    if (next[key] <= 0) delete next[key];
  }
  return next;
}

/** "1 h 20 min", "25 min", "under 1 min". */
export function formatMinutes(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m < 1) return 'under 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}
