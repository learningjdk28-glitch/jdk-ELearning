// Phase 8: batched study time, pre-test vs post-test, class comparison (3+ students), course analytics.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import { IDLE_AFTER_MS, STUDY_CHUNK_MAX, addToBucket, bucketRows, formatMinutes, localDay, shouldCount, subtractRows } from '../src/lib/studyTime.js';
import { prePost, studyMinutes } from '../src/lib/analyticsRules.js';

const root = new URL('../', import.meta.url);
const get = (f) => readFileSync(new URL(f, root), 'utf8');
const db = new PGlite();
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const as = async (id, fn) => {
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${id || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const T1 = '20000000-0000-4000-8000-000000000002';
const T2 = '30000000-0000-4000-8000-000000000003';
const S = ['40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000005', '60000000-0000-4000-8000-000000000006'];
const OUT = '70000000-0000-4000-8000-000000000007';

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), name text, bucket_id text);
alter table storage.objects enable row level security;
create publication supabase_realtime;
grant usage on schema auth, public, storage to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
alter default privileges in schema public grant all on tables to authenticated, anon;
alter default privileges in schema public grant all on functions to authenticated, anon;
`);
await db.exec(get('supabase_setup.sql'));
await db.exec(get('supabase_lms_upgrade.sql'));
for (const f of readdirSync(new URL('supabase/migrations/', root)).filter((x) => x.endsWith('.sql')).sort()) {
  await db.exec(get(`supabase/migrations/${f}`));
  await db.exec(get(`supabase/migrations/${f}`));
}
await db.exec('grant all on all tables in schema public, storage to authenticated, anon');
await db.exec(`
insert into auth.users (id, email) values ('${T1}', 't1@t.dev'), ('${T2}', 't2@t.dev'), ('${S[0]}', 'a@t.dev'), ('${S[1]}', 'b@t.dev'), ('${S[2]}', 'c@t.dev'), ('${OUT}', 'o@t.dev');
update public.profiles set role = 'admin' where id in ('${T1}', '${T2}');
`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));
const mod = (await as(T1, () => q(`insert into public.learning_modules (course_id, title) values ('c', 'M1') returning id`)))[0].id;
const units = [];
for (let p = 0; p < MODULE_PAGE_COUNT; p++) units.push((await as(T1, () => q(`insert into public.learning_units (module_id, title, content, position) values ('${mod}', 'P', 'B', ${p}) returning id`)))[0].id);
await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));
const quiz = (await as(T1, () => q(`insert into public.learning_quizzes (module_id, title, pass_mark, published) values ('${mod}', 'Q', 50, true) returning id`)))[0].id;
const qq = (await as(T1, () => q(`insert into public.learning_quiz_questions (quiz_id, prompt, options, correct_index) values ('${quiz}', 'Hard one', '["a","b"]', 1) returning id`)))[0].id;
await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S[0]}'), ('c', '${S[1]}')`));
const today = (await one(`select current_date::text d`)).d;
const addTime = (who, rows) => as(who, () => one(`select public.add_study_time('${JSON.stringify(rows)}'::jsonb) n`)).then((r) => r.n);

test('app and database agree on the study-time chunk limit and the minimum class size', async () => {
  assert.equal((await one('select public.study_time_chunk_max() n')).n, STUDY_CHUNK_MAX);
  assert.equal((await one('select public.class_min_size() n')).n, 3);
});

test('study time: one row per student, module and day; capped; only open modules and recent days', async () => {
  assert.equal(await addTime(S[0], [{ moduleId: mod, day: today, seconds: 300 }]), 300);
  assert.equal(await addTime(S[0], [{ moduleId: mod, day: today, seconds: 300 }, { moduleId: mod, day: today, seconds: 999999 }]), 300 + STUDY_CHUNK_MAX);
  assert.equal((await one(`select count(*)::int n, max(seconds) s from public.study_time where user_id = '${S[0]}'`)).n, 1);
  assert.equal(await addTime(S[0], [{ moduleId: mod, day: '2000-01-01', seconds: 60 }, { moduleId: 'not-a-uuid', day: today, seconds: 60 }]), 0);
  assert.equal(await addTime(OUT, [{ moduleId: mod, day: today, seconds: 60 }]), 0, 'not enrolled');
  await assert.rejects(as(S[0], () => q(`insert into public.study_time (user_id, module_id, day, seconds) values ('${S[0]}', '${mod}', current_date, 5)`)), /row-level security/);
  assert.equal((await as(S[1], () => q(`select * from public.study_time`))).length, 0, 'students see only their own');
  assert.equal((await as(T1, () => q(`select * from public.study_time`))).length, 1, 'the course owner sees it');
  assert.equal((await as(T2, () => q(`select * from public.study_time`))).length, 0);
});

test('class comparison is hidden below 3 students and shown from 3', async () => {
  const small = (await as(S[0], () => one(`select public.course_compare('c') r`))).r;
  assert.equal(small.class_size, 2);
  assert.equal(small.class_progress, null);
  assert.equal(small.class_minutes, null);
  assert.ok(Number(small.my_minutes) > 0);
  await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S[2]}')`));
  await as(S[1], () => q(`insert into public.unit_completions (unit_id, user_id) values ('${units[0]}', '${S[1]}')`));
  const big = (await as(S[0], () => one(`select public.course_compare('c') r`))).r;
  assert.equal(big.class_size, 3);
  assert.equal(Number(big.class_progress), Number((100 / MODULE_PAGE_COUNT / 3).toFixed(1)));
  await assert.rejects(as(OUT, () => q(`select public.course_compare('c')`)), /not enrolled/);
});

test('course analytics: first pre-test vs latest post-test, module figures, hardest questions; owner only', async () => {
  const mods = (correct) => JSON.stringify([{ module_id: mod, title: 'M1', correct, total: 4 }]);
  await q(`insert into public.pretest_attempts (course_id, user_id, stage, correct_count, question_count, score, modules, submitted_at) values
    ('c', '${S[0]}', 'pre', 1, 4, 25, '${mods(1)}', now() - interval '3 days'),
    ('c', '${S[0]}', 'pre', 3, 4, 75, '${mods(3)}', now() - interval '2 days'),
    ('c', '${S[0]}', 'post', 2, 4, 50, '${mods(2)}', now() - interval '1 day'),
    ('c', '${S[0]}', 'post', 4, 4, 100, '${mods(4)}', now())`);
  for (const [who, choice] of [[S[0], 0], [S[1], 0], [S[2], 1]]) {
    await as(who, () => q(`select public.submit_quiz('${quiz}', '${JSON.stringify([{ questionId: qq, choice }])}'::jsonb, null)`));
  }
  const d = (await as(T1, () => one(`select public.course_analytics('c') r`))).r;
  assert.deepEqual([Number(d.enrolled), Number(d.pre_avg), Number(d.post_avg), Number(d.paired_n), Number(d.paired_gain)], [3, 25, 100, 1, 75]);
  assert.deepEqual([Number(d.modules[0].pre), Number(d.modules[0].post)], [25, 100]);
  assert.deepEqual([Number(d.modules[0].quiz_takers), Number(d.modules[0].quiz_passed)], [3, 1]);
  assert.equal(d.hardest[0].prompt, 'Hard one');
  assert.equal(Math.round(Number(d.hardest[0].pct)), 33);
  assert.ok(Number(d.active_7d) >= 2);
  await assert.rejects(as(T2, () => q(`select public.course_analytics('c')`)), /own courses/);
  await assert.rejects(as(S[0], () => q(`select * from public.course_student_stats('c')`)), /permission denied/);
});

test('timer rules: counts only visible, focused and recently used; totals split and subtract safely', () => {
  const now = 1_000_000;
  assert.equal(shouldCount({ visible: true, focused: true, lastInputAt: now - 1000, now }), true);
  assert.equal(shouldCount({ visible: true, focused: true, lastInputAt: now - IDLE_AFTER_MS - 1, now }), false, 'idle');
  assert.equal(shouldCount({ visible: false, focused: true, lastInputAt: now, now }), false, 'hidden');
  assert.equal(shouldCount({ visible: true, focused: false, lastInputAt: now, now }), false, 'blurred');
  let b = addToBucket({}, 'm', '2026-01-01', 15);
  b = addToBucket(b, 'm', '2026-01-01', 15);
  b = addToBucket(b, 'm', '2026-01-02', STUDY_CHUNK_MAX + 10);
  assert.deepEqual(bucketRows(b).map((r) => r.seconds), [30, STUDY_CHUNK_MAX, 10]);
  const sent = bucketRows(b);
  const later = addToBucket(b, 'm', '2026-01-01', 15); // recorded while sending
  assert.deepEqual(subtractRows(later, sent), { 'm|2026-01-01': 15 });
  assert.equal(localDay(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
  assert.deepEqual([formatMinutes(0.4), formatMinutes(25), formatMinutes(80), formatMinutes(120)], ['under 1 min', '25 min', '1 h 20 min', '2 h']);
});

test('pre/post on the student side: first pre-test is the baseline, latest post-test the outcome', () => {
  const at = (d) => `2026-01-0${d}T00:00:00Z`;
  const pp = prePost([
    { stage: 'post', score: 90, submitted_at: at(5), modules: [{ module_id: 'm', title: 'M', correct: 9, total: 10 }] },
    { stage: 'pre', score: 40, submitted_at: at(1), modules: [{ module_id: 'm', title: 'M', correct: 4, total: 10 }, { module_id: 'x', title: 'X', correct: 0, total: 0 }] },
    { stage: 'pre', score: 70, submitted_at: at(3), modules: [] },
    { stage: 'post', score: 60, submitted_at: at(4), modules: [] },
  ]);
  assert.deepEqual([pp.pre, pp.post, pp.gain], [40, 90, 50]);
  assert.deepEqual(pp.modules, [{ module_id: 'm', title: 'M', pre: 40, post: 90 }], 'modules without questions are left out');
  assert.deepEqual(prePost([]), { pre: null, post: null, gain: null, preAt: null, postAt: null, modules: [] });
  const today = new Date(2026, 0, 10);
  const mins = studyMinutes([{ module_id: 'a', day: '2026-01-10', seconds: 600 }, { module_id: 'a', day: '2026-01-04', seconds: 600 }, { module_id: 'a', day: '2026-01-03', seconds: 600 }, { module_id: 'z', day: '2026-01-10', seconds: 600 }], ['a'], today);
  assert.deepEqual(mins, { total: 30, week: 20 });
});
