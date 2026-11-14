// Phase 4: course pre-test, placement (start module, tested-out modules, level) and the Digital Literacy seed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import { coursePath } from '../src/lib/learningPath.js';
import { questionError } from '../src/lib/questionRules.js';

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
insert into auth.users (id, email) values ('${T1}', 't1@t.dev'), ('${T2}', 't2@t.dev'), ('${S1}', 's1@t.dev'), ('${S2}', 's2@t.dev');
update public.profiles set role = 'admin' where id in ('${T1}', '${T2}');
`);

// T1's course: three published modules with MODULE_PAGE_COUNT pages each, and a pre-test.
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));
const mods = [];
for (let m = 0; m < 3; m++) {
  const id = (await as(T1, () => q(`insert into public.learning_modules (course_id, title, position) values ('c', 'M${m + 1}', ${m}) returning id`)))[0].id;
  for (let p = 0; p < MODULE_PAGE_COUNT; p++) await as(T1, () => q(`insert into public.learning_units (module_id, title, content, position) values ('${id}', 'P', 'Body', ${p})`));
  await as(T1, () => q(`update public.learning_modules set published = true where id = '${id}'`));
  mods.push(id);
}
const addQ = (moduleId, correct = 0) => as(T1, () => q(`insert into public.pretest_questions (course_id, module_id, prompt, options, correct_index) values ('c', '${moduleId}', 'Q', '["a","b","c"]', ${correct}) returning id`));
const qs = { m1: [], m2: [] };
for (let i = 0; i < 2; i++) qs.m1.push((await addQ(mods[0]))[0].id);
for (let i = 0; i < 2; i++) qs.m2.push((await addQ(mods[1]))[0].id);
// M3 has no questions on purpose.
await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S1}')`));

const submit = (who, answers, clientId = null) => as(who, () => q(`select public.submit_course_pretest('c', '${JSON.stringify(answers)}'::jsonb, 'pre', ${clientId ? `'${clientId}'` : 'null'}) r`)).then((r) => r[0].r);
const right = (ids) => ids.map((id) => ({ questionId: id, choice: 0 }));
const wrong = (ids) => ids.map((id) => ({ questionId: id, choice: 1 }));

test('level thresholds are data: 0 / 50 / 80 map to foundational / standard / advanced', async () => {
  const rows = await q(`select s, public.level_for_score(s) l from unnest(array[0, 49.99, 50, 79, 80, 100]) s`);
  assert.deepEqual(rows.map((r) => r.l), ['foundational', 'foundational', 'standard', 'standard', 'advanced', 'advanced']);
});

test('the pre-test cannot be turned on without questions', async () => {
  await as(T1, () => q(`insert into public.courses (id, title) values ('empty', 'Empty')`));
  await assert.rejects(as(T1, () => q(`update public.courses set pretest_published = true where id = 'empty'`)), /at least one pre-test question/);
  await as(T1, () => q(`update public.courses set pretest_published = true where id = 'c'`));
});

test("a question's module must belong to the same course; only the owner writes questions", async () => {
  await as(T2, () => q(`insert into public.courses (id, title) values ('other', 'Other')`));
  const otherMod = (await as(T2, () => q(`insert into public.learning_modules (course_id, title) values ('other', 'X') returning id`)))[0].id;
  await assert.rejects(as(T1, () => q(`insert into public.pretest_questions (course_id, module_id, prompt, options, correct_index) values ('c', '${otherMod}', 'Q', '["a","b"]', 0)`)), /same course|row-level/);
  await assert.rejects(as(T2, () => q(`insert into public.pretest_questions (course_id, module_id, prompt, options, correct_index) values ('c', '${mods[0]}', 'Q', '["a","b"]', 0)`)), /row-level security/);
});

test('students never see the answer key; they get questions without answers through the RPC', async () => {
  assert.equal((await as(S1, () => q(`select * from public.pretest_questions`))).length, 0);
  const p = (await as(S1, () => q(`select public.get_course_pretest('c') p`)))[0].p;
  assert.equal(p.questions.length, 4);
  assert.ok(p.questions.every((x) => !('correct_index' in x) && x.module_id && x.prompt));
  await assert.rejects(as(S2, () => q(`select public.get_course_pretest('c')`)), /unavailable/, 'not enrolled');
});

test('placement: start at the first module below the pass mark; modules before it are tested out', async () => {
  const r = await submit(S1, [...right(qs.m1), ...wrong(qs.m2)]);
  assert.equal(r.start_module_id, mods[1]);
  assert.deepEqual(r.tested_out, [mods[0]]);
  assert.equal(Number(r.score), 50);
  assert.equal(r.level_id, 'standard');
  assert.deepEqual(r.modules.map((m) => [m.correct, m.total, m.passed]), [[2, 2, true], [0, 2, false], [0, 0, false]]);
});

test('a module without questions cannot be tested out; all right -> start there, advanced level', async () => {
  const r = await submit(S1, [...right(qs.m1), ...right(qs.m2)]);
  assert.deepEqual(r.tested_out, [mods[0], mods[1]]);
  assert.equal(r.start_module_id, mods[2]);
  assert.equal(r.level_id, 'advanced');
});

test('nothing right -> start at module 1, foundational; blank answers count as not known', async () => {
  const r = await submit(S1, []);
  assert.deepEqual([r.start_module_id, r.tested_out, r.level_id, Number(r.score)], [mods[0], [], 'foundational', 0]);
});

test('the same submission (client id) counts once', async () => {
  const id = 'aaaaaaaa-0000-4000-8000-000000000001';
  const first = await submit(S1, right(qs.m1), id);
  const again = await submit(S1, wrong(qs.m1), id);
  assert.equal(again.attempt_id, first.attempt_id);
  assert.equal(again.duplicate, true);
  assert.equal((await one(`select count(*)::int n from public.pretest_attempts where client_id = '${id}'`)).n, 1);
});

test('attempts are visible to the student and the course owner only; nobody writes them directly', async () => {
  assert.ok((await as(S1, () => q(`select id from public.pretest_attempts`))).length >= 1);
  assert.ok((await as(T1, () => q(`select id from public.pretest_attempts`))).length >= 1);
  assert.equal((await as(T2, () => q(`select id from public.pretest_attempts`))).length, 0);
  await assert.rejects(as(S1, () => q(`insert into public.pretest_attempts (course_id, user_id, correct_count, question_count, score) values ('c', '${S1}', 9, 9, 100)`)), /row-level security/);
});

test('seed: Digital Literacy pre-test arrives with every question tagged to its module and is switched on', async () => {
  const rows = await q(`select m.title, count(*)::int n from public.pretest_questions p join public.learning_modules m on m.id = p.module_id
                        where p.course_id = 'digital-literacy' group by m.title, m.position order by m.position`);
  assert.equal(rows.reduce((n, r) => n + r.n, 0), 16, 'the 16 diagnostic questions');
  assert.equal(rows.length, 5, 'every Digital Literacy module has pre-test questions');
  assert.equal((await one(`select pretest_published p from public.courses where id = 'digital-literacy'`)).p, true);
  assert.equal((await one(`select count(*)::int n from public.pretest_questions where course_id = 'networking-basics'`)).n, 0);
});

test('path: tested-out modules count as finished; Continue goes to the first module still to learn', () => {
  const pages = (p) => Array.from({ length: MODULE_PAGE_COUNT }, (_, i) => ({ id: `${p}${i}`, position: i }));
  const ms = ['a', 'b', 'c'].map((id, i) => ({ id, position: i, title: id, pages: pages(id), quizzes: [{ id: `${id}q` }] }));
  const path = coursePath(ms, new Set(), new Set(), { testedOut: new Set(['a']), pretest: 'done' });
  assert.deepEqual(path.items.map((i) => i.status), ['tested-out', 'current', 'next']);
  assert.equal(path.continue.moduleId, 'b');
  assert.equal(path.modulesDone, 1);
  assert.equal(path.percent, Math.round(100 / 3));
});

test('path: a waiting pre-test is the one "start here" step', () => {
  const ms = [{ id: 'a', position: 0, title: 'a', pages: [], quizzes: [] }];
  const path = coursePath(ms, new Set(), new Set(), { pretest: 'todo' });
  assert.equal(path.continue.kind, 'pretest');
  assert.deepEqual(path.items.map((i) => i.status), ['next']);
});

test('question validation', () => {
  assert.match(questionError({ prompt: '', options: ['a', 'b'], correct_index: 0 }), /Write the question/);
  assert.match(questionError({ prompt: 'Q', options: ['a'], correct_index: 0 }), /at least 2/);
  assert.match(questionError({ prompt: 'Q', options: ['a', 'A'], correct_index: 0 }), /same/);
  assert.match(questionError({ prompt: 'Q', options: ['a', 'b'], correct_index: null }), /correct answer/);
  assert.equal(questionError({ prompt: 'Q', options: ['a', 'b'], correct_index: 1 }), '');
});
