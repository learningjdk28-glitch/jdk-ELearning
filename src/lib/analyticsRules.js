// Analytics helpers for the student Progress page. The instructor figures come from course_analytics() in the database.
import { localDay } from './studyTime.js';

const pct = (correct, total) => (Number(total) > 0 ? Math.round((1000 * Number(correct)) / Number(total)) / 10 : null);

/**
 * Pre-test vs post-test for one course. The baseline is the FIRST pre-test (retakes after studying would hide the gain);
 * the outcome is the LATEST post-test. attempts: [{ stage, score, modules: [{ module_id, title, correct, total }], submitted_at }].
 */
export function prePost(attempts) {
  const sorted = [...(attempts || [])].sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
  const pre = sorted.find((a) => a.stage === 'pre') || null;
  const post = [...sorted].reverse().find((a) => a.stage === 'post') || null;
  const byModule = new Map();
  for (const [stage, attempt] of [['pre', pre], ['post', post]]) {
    for (const m of attempt?.modules || []) {
      if (!Number(m.total)) continue;
      const row = byModule.get(m.module_id) || { module_id: m.module_id, title: m.title, pre: null, post: null };
      row[stage] = pct(m.correct, m.total);
      byModule.set(m.module_id, row);
    }
  }
  const preScore = pre ? Math.round(Number(pre.score)) : null;
  const postScore = post ? Math.round(Number(post.score)) : null;
  return {
    pre: preScore,
    post: postScore,
    gain: preScore != null && postScore != null ? postScore - preScore : null,
    preAt: pre?.submitted_at || null,
    postAt: post?.submitted_at || null,
    modules: [...byModule.values()],
  };
}

/** Minutes per course and this week (the last 7 days, today included) from study_time rows. */
export function studyMinutes(rows, moduleIds, today = new Date()) {
  const ids = new Set(moduleIds);
  const start = new Date(today);
  start.setDate(start.getDate() - 6);
  const from = localDay(start);
  let total = 0;
  let week = 0;
  for (const r of rows || []) {
    if (!ids.has(r.module_id)) continue;
    total += Number(r.seconds);
    if (r.day >= from) week += Number(r.seconds);
  }
  return { total: Math.round(total / 60), week: Math.round(week / 60) };
}
