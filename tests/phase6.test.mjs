// Phase 6: offline. Quiz retries count once; the offline overlay and queue rules; nothing secret is cached.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import {
  OUTBOX_KINDS, isNetworkError, outboxSummary, overlayAssignments, overlayLearning, overlayModule,
  pendingPretest, pendingQuiz, pendingSubmission, sendOrder,
} from '../src/lib/offlineRules.js';

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
const S1 = '40000000-0000-4000-8000-000000000004';
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
insert into auth.users (id, email) values ('${T1}', 't1@t.dev'), ('${S1}', 's1@t.dev'), ('${S3}', 's3@t.dev');
update public.profiles set role = 'admin' where id = '${T1}';
`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));
await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S1}'), ('c', '${S3}')`));
const mod = (await as(T1, () => q(`insert into public.learning_modules (course_id, title) values ('c', 'M1') returning id`)))[0].id;
for (let p = 0; p < MODULE_PAGE_COUNT; p++) await as(T1, () => q(`insert into public.learning_units (module_id, title, content, position) values ('${mod}', 'P', 'Body', ${p})`));
await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));
const quizId = (await as(T1, () => q(`insert into public.learning_quizzes (module_id, title, pass_mark, published) values ('${mod}', 'Q', 50, true) returning id`)))[0].id;
const qid = (await as(T1, () => q(`insert into public.learning_quiz_questions (quiz_id, prompt, options, correct_index) values ('${quizId}', 'Q', '["a","b"]', 1) returning id`)))[0].id;
const answers = JSON.stringify([{ questionId: qid, choice: 1 }]);
const CID = '70000000-0000-4000-8000-000000000007';

test('a quiz attempt sent twice with the same client id counts once', async () => {
  const first = (await as(S1, () => one(`select public.submit_quiz('${quizId}', '${answers}'::jsonb, '${CID}') r`))).r;
  const again = (await as(S1, () => one(`select public.submit_quiz('${quizId}', '${answers}'::jsonb, '${CID}') r`))).r;
  assert.equal(again.attempt_id, first.attempt_id);
  assert.equal(again.replayed, true);
  assert.equal(Number(again.score), 100);
  assert.equal((await one(`select count(*)::int n from public.learning_quiz_attempts where client_id = '${CID}'`)).n, 1);
  await assert.rejects(as(S3, () => q(`select public.submit_quiz('${quizId}', '${answers}'::jsonb, '${CID}')`)), /duplicate|unique/, 'another student cannot reuse it');
});

test('the old quiz function still works and creates a new attempt each time', async () => {
  const before = (await one(`select count(*)::int n from public.learning_quiz_attempts`)).n;
  await as(S1, () => q(`select public.submit_learning_quiz('${quizId}', '${answers}'::jsonb)`));
  await as(S1, () => q(`select public.submit_learning_quiz('${quizId}', '${answers}'::jsonb)`));
  assert.equal((await one(`select count(*)::int n from public.learning_quiz_attempts`)).n, before + 2);
});

test('the quiz copy kept on the device never contains the answers', async () => {
  const quiz = (await as(S1, () => one(`select public.get_learning_quiz('${quizId}') r`))).r;
  assert.ok(quiz.questions.length > 0);
  assert.ok(quiz.questions.every((x) => !('correct_index' in x) && !('explanation' in x)));
});

test('no connection vs refused by the server', () => {
  assert.equal(isNetworkError(new Error('TypeError: Failed to fetch'), true), true);
  assert.equal(isNetworkError(new Error('Load failed'), true), true);
  assert.equal(isNetworkError({ message: 'anything', offline: true }, true), true);
  assert.equal(isNetworkError(new Error('new row violates row-level security policy'), true), false);
  assert.equal(isNetworkError(new Error('This quiz is closed'), true), false);
  assert.equal(isNetworkError(new Error('This quiz is closed'), false), true, 'offline device: always retry later');
});

const item = (kind, payload, extra = {}) => ({ id: `${kind}-${JSON.stringify(payload)}`, kind, payload, createdAt: extra.at || '2026-01-01T00:00:00Z', status: extra.status || 'pending' });
const items = [
  item('page', { unitId: 'u2' }, { at: '2026-01-01T00:00:02Z' }),
  item('activity', { activityId: 'a1' }, { at: '2026-01-01T00:00:01Z' }),
  item('quiz', { quizId: 'q1', answers: [] }),
  item('pretest', { courseId: 'c' }),
  item('submission', { assignmentId: 'as1', kind: 'link' }),
  item('quiz', { quizId: 'q-failed' }, { status: 'failed' }),
  item('page', { unitId: 'u-failed' }, { status: 'failed' }),
];

test('work saved offline shows on top of the last server copy; failed items do not', () => {
  const learning = overlayLearning({
    done: new Set(['u1']),
    passed: new Set(),
    courses: [{ course: { id: 'c' }, placement: { pretest: 'todo' } }, { course: { id: 'd' }, placement: { pretest: 'todo' } }],
  }, items);
  assert.deepEqual([...learning.done].sort(), ['u1', 'u2']);
  assert.deepEqual(learning.courses.map((c) => c.placement.pretest), ['pending', 'todo']);

  const mod = overlayModule({ done: new Set(), activitiesDone: new Set() }, items);
  assert.deepEqual([...mod.done], ['u2']);
  assert.deepEqual([...mod.activitiesDone], ['a1']);
  assert.deepEqual([...mod.pendingQuizzes], ['q1']);
  assert.equal(overlayModule(null, items), null);

  assert.ok(pendingQuiz(items, 'q1'));
  assert.equal(pendingQuiz(items, 'q-failed'), null, 'a refused attempt can be answered again');
  assert.ok(pendingPretest(items, 'c'));
  assert.ok(pendingSubmission(items, 'as1'));
  assert.deepEqual(overlayAssignments([{ id: 'as1' }, { id: 'as2' }], items).map((a) => Boolean(a.pending)), [true, false]);
});

test('the queue sends oldest first, skips failed items, and counts both', () => {
  assert.deepEqual(sendOrder(items).map((i) => i.kind), ['quiz', 'pretest', 'submission', 'activity', 'page']);
  assert.deepEqual(outboxSummary(items), { pending: 5, failed: 2, total: 7 });
});

test('every queued kind has a sender, and files are never queued', () => {
  const src = get('src/services/offline.js');
  const senders = src.slice(src.indexOf('const SEND = {'), src.indexOf('};', src.indexOf('const SEND = {')));
  for (const kind of Object.keys(OUTBOX_KINDS)) assert.match(senders, new RegExp(`\\n  ${kind}: `), kind);
  assert.match(get('src/services/assignments.js'), /if \(kind === 'file'\) throw/);
  assert.doesNotMatch(senders, /storage\.from\('submissions'\)\.upload/);
});
