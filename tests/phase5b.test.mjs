// Phase 5b: quiz deadlines and review, quiz results, activity validation and completion tracking.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { deadlineState, toLocalInput } from '../src/lib/submissionRules.js';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import { activityError, buildSpec, formFromSpec, passwordChecks, shuffledSteps } from '../src/lib/activityRules.js';

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
const S1 = '40000000-0000-4000-8000-000000000004';
const S2 = '50000000-0000-4000-8000-000000000005';
const S3 = '60000000-0000-4000-8000-000000000006';

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
insert into auth.users (id, email) values ('${T1}', 't1@t.dev'), ('${T2}', 't2@t.dev'), ('${S1}', 's1@t.dev'), ('${S2}', 's2@t.dev'), ('${S3}', 's3@t.dev');
update public.profiles set role = 'admin' where id in ('${T1}', '${T2}');
`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));
await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S1}'), ('c', '${S3}')`));
const mod = (await as(T1, () => q(`insert into public.learning_modules (course_id, title) values ('c', 'M1') returning id`)))[0].id;
for (let p = 0; p < MODULE_PAGE_COUNT; p++) await as(T1, () => q(`insert into public.learning_units (module_id, title, content, position) values ('${mod}', 'P', 'Body', ${p})`));
await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));

const quiz = async (cols = '', vals = '') => {
  const id = (await as(T1, () => q(`insert into public.learning_quizzes (module_id, title, pass_mark, published ${cols}) values ('${mod}', 'Q', 50, true ${vals}) returning id`)))[0].id;
  const qs = [];
  for (let i = 0; i < 2; i++) {
    qs.push((await as(T1, () => q(`insert into public.learning_quiz_questions (quiz_id, prompt, options, correct_index, position, explanation)
      values ('${id}', 'Q${i}', '["a","b","c"]', 1, ${i}, 'Because b') returning id`)))[0].id);
  }
  return { id, qs };
};
const submit = (who, z, choices) => as(who, () => q(`select public.submit_learning_quiz('${z.id}',
  '${JSON.stringify(z.qs.map((questionId, i) => ({ questionId, choice: choices[i] })))}'::jsonb) r`)).then((r) => r[0].r);
const openQuiz = await quiz();

test('a failed attempt shows right/wrong and explanations but not the correct option', async () => {
  const r = await submit(S1, openQuiz, [0, 0]);
  assert.deepEqual([Number(r.score), r.passed, r.is_late], [0, false, false]);
  assert.equal(r.review.length, 2);
  assert.ok(r.review.every((x) => x.correct === false && x.explanation === 'Because b' && x.correctIndex === undefined && x.choice === 0));
  const stored = await one(`select answers from public.learning_quiz_attempts where id = '${r.attempt_id}'`);
  assert.deepEqual(stored.answers.map((a) => a.choice), [0, 0]);
});

test('a passed attempt reveals the correct options; later reviews of a failed one do too', async () => {
  const fail = (await submit(S1, openQuiz, [2, 2])).attempt_id;
  const r = await submit(S1, openQuiz, [1, 0]);
  assert.deepEqual([Number(r.score), r.passed], [50, true]);
  assert.deepEqual(r.review.map((x) => [x.correct, x.correctIndex]), [[true, 1], [false, 1]]);
  const again = await as(S1, () => one(`select public.quiz_attempt_review('${fail}') r`));
  assert.deepEqual(again.r.review.map((x) => x.correctIndex), [1, 1]);
  await assert.rejects(as(S3, () => q(`select public.quiz_attempt_review('${fail}')`)), /Attempt not found/);
});

test('students cannot call the answer-revealing helper or write attempts directly', async () => {
  await assert.rejects(as(S1, () => q(`select public.quiz_review('${openQuiz.id}', '[]'::jsonb, true)`)), /permission denied/);
  await assert.rejects(as(S1, () => q(`insert into public.learning_quiz_attempts (quiz_id, user_id, correct_count, question_count, score, passed)
    values ('${openQuiz.id}', '${S1}', 2, 2, 100, true)`)), /row-level security/);
  await assert.rejects(submit(S2, openQuiz, [1, 1]), /not available/, 'not enrolled');
});

test('after the deadline: attempts are marked late by the server clock, or refused when late work is off', async () => {
  const late = await quiz(', due_at', `, now() - interval '1 hour'`);
  const r = await submit(S1, late, [0, 0]);
  assert.equal(r.is_late, true);
  assert.ok(r.review.every((x) => x.correctIndex === 1), 'a quiz past its deadline reveals answers');
  const closed = await quiz(', due_at, allow_late', `, now() - interval '1 hour', false`);
  await assert.rejects(submit(S1, closed, [1, 1]), /closed/);
  const fine = await quiz(', due_at', `, now() + interval '1 day'`);
  assert.equal((await submit(S1, fine, [1, 1])).is_late, false);
  const got = await as(S1, () => one(`select public.get_learning_quiz('${closed.id}') r`));
  assert.equal(got.r.allow_late, false);
  assert.equal(got.r.module_id, mod);
  assert.ok(got.r.due_at);
});

test('quiz results list every enrolled student, for the course owner only', async () => {
  const rows = await as(T1, () => q(`select * from public.quiz_results('${openQuiz.id}')`));
  const byUser = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  assert.equal(Number(byUser[S1].attempts), 3);
  assert.equal(Number(byUser[S1].best_score), 50);
  assert.equal(byUser[S1].passed, true);
  assert.equal(Number(byUser[S3].attempts), 0, 'an enrolled student who has not started is listed');
  assert.equal(byUser[S2], undefined);
  await assert.rejects(as(T2, () => q(`select * from public.quiz_results('${openQuiz.id}')`)), /own courses/);
});

test('every seeded activity passes the database rules, and bad settings are refused', async () => {
  const seeded = await q(`select kind, spec, public.activity_spec_error(kind, spec) err from public.learning_activities`);
  assert.ok(seeded.length >= 9);
  assert.deepEqual(seeded.filter((a) => a.err), []);
  assert.ok(seeded.every((a) => activityError(a.kind, a.spec) === ''), 'and the JS rules');
  await assert.rejects(as(T1, () => q(`insert into public.learning_activities (module_id, kind, title, spec) values ('${mod}', 'sort', 'S', '{"groups":["A"],"items":[]}')`)), /2 to 6 groups/);
});

test('JS and database activity rules agree', async () => {
  const cases = [
    ['sort', { groups: ['A', 'B'], items: [{ id: 'a', label: 'x', group: 'A' }, { id: 'b', label: 'y', group: 'B' }] }],
    ['sort', { groups: ['A', 'a'], items: [{ id: 'a', label: 'x', group: 'A' }, { id: 'b', label: 'y', group: 'a' }] }],
    ['sort', { groups: ['A', 'B'], items: [{ id: 'a', label: 'x', group: 'C' }, { id: 'b', label: 'y', group: 'B' }] }],
    ['sort', { groups: ['A', 'B'], items: [{ id: 'a', label: 'x', group: 'A' }, { id: 'a', label: 'y', group: 'B' }] }],
    ['sort', { groups: ['A', 'B'], items: [{ id: 'a', label: ' ', group: 'A' }, { id: 'b', label: 'y', group: 'B' }] }],
    ['order', { steps: ['2', '1'], answer: ['1', '2'] }],
    ['order', { steps: ['1', '2'], answer: ['1', '3'] }],
    ['order', { steps: ['1', '1'], answer: ['1', '1'] }],
    ['order', { steps: ['1'], answer: ['1'] }],
    ['spot', { segments: [{ id: 's1', text: 'x', flag: true, why: '' }, { id: 's2', text: 'y', flag: false }] }],
    ['spot', { segments: [{ id: 's1', text: 'x', flag: false }, { id: 's2', text: 'y', flag: false }] }],
    ['spot', { segments: [{ id: 's1', text: 'x', flag: 'yes' }, { id: 's2', text: 'y', flag: true }] }],
    ['spot', { segments: [{ id: 's1', text: 'x', flag: true }, { id: 's1', text: 'y', flag: true }] }],
    ['password', {}],
    ['sort', []],
  ];
  for (const [kind, spec] of cases) {
    const fromDb = (await one(`select public.activity_spec_error('${kind}', '${JSON.stringify(spec)}'::jsonb) e`)).e;
    assert.equal(fromDb || '', activityError(kind, spec), `${kind} ${JSON.stringify(spec)}`);
  }
});

test('activity completion: enrolled students, published activities, once, only through the function', async () => {
  const act = (await as(T1, () => q(`insert into public.learning_activities (module_id, kind, title, published) values ('${mod}', 'password', 'P', true) returning id`)))[0].id;
  const draft = (await as(T1, () => q(`insert into public.learning_activities (module_id, kind, title) values ('${mod}', 'password', 'D') returning id`)))[0].id;
  const first = (await as(S1, () => one(`select public.complete_activity('${act}') t`))).t;
  const second = (await as(S1, () => one(`select public.complete_activity('${act}') t`))).t;
  assert.deepEqual(first, second, 'the first completion time is kept');
  await assert.rejects(as(S2, () => q(`select public.complete_activity('${act}')`)), /unavailable/, 'not enrolled');
  await assert.rejects(as(S1, () => q(`select public.complete_activity('${draft}')`)), /unavailable/, 'draft');
  await assert.rejects(as(S3, () => q(`insert into public.activity_completions (activity_id, user_id) values ('${act}', '${S3}')`)), /row-level security/);
  assert.equal((await as(S3, () => q(`select * from public.activity_completions`))).length, 0, 'students see only their own');
  const prog = await as(T1, () => q(`select * from public.activity_progress('${mod}')`));
  const row = prog.find((p) => p.activity_id === act);
  assert.deepEqual([Number(row.completed), Number(row.enrolled)], [1, 2]);
  await assert.rejects(as(T2, () => q(`select * from public.activity_progress('${mod}')`)), /own courses/);
});

test('order activities: the shuffle is stable, uses the same steps, and is never already solved', () => {
  for (const answer of [['a', 'b'], ['1', '2', '3'], ['x', 'y', 'z', 'w', 'v']]) {
    const s = shuffledSteps(answer);
    assert.deepEqual([...s].sort(), [...answer].sort());
    assert.notDeepEqual(s, answer);
    assert.deepEqual(shuffledSteps(answer), s);
  }
  const spec = buildSpec('order', { steps: [' One ', 'Two', 'Three'] });
  assert.deepEqual(spec.answer, ['One', 'Two', 'Three']);
  assert.deepEqual(formFromSpec('order', spec).steps, spec.answer, 'edited in the correct order');
  const sort = buildSpec('sort', { groups: [' A ', 'B'], items: [{ id: '', label: ' x ', group: 'A' }, { id: 'k', label: 'y', group: 'B' }] });
  assert.equal(sort.items[0].label, 'x');
  assert.ok(sort.items[0].id, 'new items get an id');
  assert.equal(activityError('sort', sort), '');
});

test('deadline states and the datetime-local helper', () => {
  const now = new Date('2026-06-01T12:00:00Z');
  assert.equal(deadlineState(null, true, now), 'none');
  assert.equal(deadlineState('2026-06-02T00:00:00Z', false, now), 'open');
  assert.equal(deadlineState('2026-05-30T00:00:00Z', true, now), 'late');
  assert.equal(deadlineState('2026-05-30T00:00:00Z', false, now), 'closed');
  const iso = '2026-06-01T12:34:00.000Z';
  assert.equal(new Date(toLocalInput(iso)).toISOString(), iso);
  assert.ok(passwordChecks('blue-mango-river-42').every((c) => c.ok));
});
