// Phase 0: course ownership, super administrator, profile fields, validation parity.
// Runs every migration in production order against PGlite with a Supabase-like auth/storage stub.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PATTERNS, phoneSchema, addressSchema, schoolIdSchema } from '../src/lib/validation.js';

const root = new URL('../', import.meta.url);
const get = (f) => readFileSync(new URL(f, root), 'utf8');
const db = new PGlite();
const q = async (sql) => (await db.query(sql)).rows;
const as = async (id, fn) => {
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${id || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};

const SUPER = '10000000-0000-4000-8000-000000000001';
const T1 = '20000000-0000-4000-8000-000000000002'; // instructor 1
const T2 = '30000000-0000-4000-8000-000000000003'; // instructor 2
const S1 = '40000000-0000-4000-8000-000000000004'; // student of T1
const S2 = '50000000-0000-4000-8000-000000000005'; // student of T2
const S3 = '60000000-0000-4000-8000-000000000006'; // not enrolled anywhere

await db.exec(`
create role anon nologin; create role authenticated nologin;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
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

const ORDER = [
  'supabase_setup.sql',
  'supabase_lms_upgrade.sql',
  'supabase/migrations/20261113_lms_v2.sql',
  'supabase/migrations/20261114_admin_allowlist.sql',
];
for (const f of ORDER) await db.exec(get(f));

// A learner who existed BEFORE Phase 0 must be backfilled with a student number.
await db.exec(`insert into auth.users (id, email) values ('${S3}', 'early@test.dev')`);
await db.exec(`update public.profiles set created_at = '2025-03-01' where id = '${S3}'`);

const PHASE0 = get('supabase/migrations/20261115_phase0_ownership_profiles.sql');
await db.exec(PHASE0);
await db.exec(PHASE0); // must be safe to re-run
await db.exec('grant all on all tables in schema public, storage to authenticated, anon');

await db.exec(`
insert into auth.users (id, email) values
 ('${SUPER}', 'super@test.dev'), ('${T1}', 't1@test.dev'), ('${T2}', 't2@test.dev'),
 ('${S1}', 's1@test.dev'), ('${S2}', 's2@test.dev');
update public.profiles set role = 'admin', is_super_admin = true where id = '${SUPER}';
update public.profiles set role = 'admin' where id in ('${T1}', '${T2}');
`);

// T1 builds a draft course with content; T2 builds their own.
await as(T1, () => q(`insert into public.courses (id, title, published) values ('t1-course', 'T1 course', true), ('t1-draft', 'T1 draft', false)`));
await as(T2, () => q(`insert into public.courses (id, title, published) values ('t2-course', 'T2 course', true)`));
const mod1 = (await as(T1, () => q(`insert into public.learning_modules (course_id, title, published) values ('t1-course', 'M1', true) returning id`)))[0].id;
const unit1 = (await as(T1, () => q(`insert into public.learning_units (module_id, title, content, published) values ('${mod1}', 'Page', 'Body', false) returning id`)))[0].id;
const quiz1 = (await as(T1, () => q(`insert into public.learning_quizzes (module_id, title, published) values ('${mod1}', 'Quiz', false) returning id`)))[0].id;
await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('t1-course', '${S1}')`));
await as(T2, () => q(`insert into public.course_enrollments (course_id, user_id) values ('t2-course', '${S2}')`));

const count = async (who, sql) => (await as(who, () => q(sql))).length;
const denied = /row-level security|super administrator|own courses|Admin access|cannot be changed/;

test('migration ran twice without error and courses get their creator as owner', async () => {
  const rows = await q(`select id, owner_id from public.courses where id like 't%' order by id`);
  assert.deepEqual(rows.map((r) => [r.id, r.owner_id]), [['t1-course', T1], ['t1-draft', T1], ['t2-course', T2]]);
  assert.equal((await q(`select owner_id from public.courses where id = 'networking-basics'`))[0].owner_id, null, 'existing courses stay unassigned');
});

test('instructor cannot create a course owned by someone else', async () => {
  await assert.rejects(as(T2, () => q(`insert into public.courses (id, title, owner_id) values ('steal', 'X', '${T1}')`)), denied);
});

test("instructor sees own drafts but not another instructor's drafts or content", async () => {
  assert.equal(await count(T1, `select id from public.courses where id = 't1-draft'`), 1);
  assert.equal(await count(T2, `select id from public.courses where id = 't1-draft'`), 0);
  assert.equal(await count(T2, `select id from public.learning_units where id = '${unit1}'`), 0);
  assert.equal(await count(T2, `select id from public.learning_quizzes where id = '${quiz1}'`), 0);
});

test("instructor cannot change another instructor's course, modules, units or quizzes", async () => {
  assert.equal(await count(T2, `update public.courses set title = 'hacked' where id = 't1-course' returning id`), 0);
  assert.equal(await count(T2, `delete from public.courses where id = 't1-course' returning id`), 0);
  await assert.rejects(as(T2, () => q(`insert into public.learning_modules (course_id, title) values ('t1-course', 'Intrude')`)), denied);
  assert.equal(await count(T2, `update public.learning_units set title = 'x' where id = '${unit1}' returning id`), 0);
  assert.equal(await count(T2, `update public.learning_quizzes set title = 'x' where id = '${quiz1}' returning id`), 0);
  await assert.rejects(as(T2, () => q(`update public.courses set owner_id = '${T1}' where id = 't2-course'`)), denied, 'cannot hand a course to someone else');
});

test('enrollments: owner manages own course only', async () => {
  assert.equal(await count(T1, `select * from public.course_enrollments`), 1);
  await assert.rejects(as(T2, () => q(`insert into public.course_enrollments (course_id, user_id) values ('t1-course', '${S3}')`)), denied);
  assert.equal(await count(T2, `update public.course_enrollments set status = 'revoked' where course_id = 't1-course' returning user_id`), 0);
  await assert.rejects(as(T2, () => q(`select * from public.lms_admin_enrollments('t1-course')`)), denied);
  assert.equal((await as(T1, () => q(`select * from public.lms_admin_enrollments('t1-course')`))).length, 1);
});

test('profiles: instructors read only the students they teach; students read only themselves', async () => {
  assert.equal(await count(T1, `select id from public.profiles where id = '${S1}'`), 1);
  assert.equal(await count(T1, `select id from public.profiles where id = '${S2}'`), 0);
  assert.equal(await count(T1, `select id from public.profiles where id = '${S3}'`), 0);
  assert.equal(await count(S1, `select id from public.profiles`), 1);
  assert.equal(await count(SUPER, `select id from public.profiles`), 6);
});

test('directory: instructor sees own students plus exact-email lookup, never everyone', async () => {
  const mine = await as(T1, () => q(`select user_id from public.lms_admin_students('', 100, 0)`));
  assert.deepEqual(mine.map((r) => r.user_id), [S1]);
  assert.equal((await as(T1, () => q(`select * from public.lms_admin_students('s2@test', 100, 0)`))).length, 0, 'partial email is not a lookup');
  assert.equal((await as(T1, () => q(`select * from public.lms_admin_students('S2@test.dev', 100, 0)`))).length, 1, 'exact email finds anyone to enroll');
  assert.equal((await as(SUPER, () => q(`select * from public.lms_admin_students('', 100, 0)`))).length, 6);
  await assert.rejects(as(S1, () => q(`select * from public.lms_admin_students('', 100, 0)`)), denied);
});

test('summary and metrics are scoped to the caller', async () => {
  const t1 = (await as(T1, () => q(`select public.lms_admin_summary() s`)))[0].s;
  assert.equal(t1.courses, 2); assert.equal(t1.students, 1); assert.equal(t1.admins, null);
  const sup = (await as(SUPER, () => q(`select public.lms_admin_summary() s`)))[0].s;
  assert.ok(sup.courses >= 5); assert.equal(sup.admins, 3);
  const metrics = await as(T2, () => q(`select course_id from public.lms_admin_course_metrics()`));
  assert.deepEqual(metrics.map((r) => r.course_id), ['t2-course']);
});

test('roles and super flag change only through the super administrator', async () => {
  await assert.rejects(as(T1, () => q(`update public.profiles set role = 'learner' where id = '${T1}'`)), denied);
  await assert.rejects(as(T1, () => q(`update public.profiles set is_super_admin = true where id = '${T1}'`)), denied);
  await assert.rejects(as(S1, () => q(`update public.profiles set role = 'admin' where id = '${S1}'`)), denied);
  await as(SUPER, () => q(`update public.profiles set role = 'admin' where id = '${S3}'`));
  assert.equal((await q(`select role from public.profiles where id = '${S3}'`))[0].role, 'admin');
  await as(SUPER, () => q(`update public.profiles set role = 'learner' where id = '${S3}'`));
});

test('admin email list is super-administrator only', async () => {
  await assert.rejects(as(T1, () => q(`insert into public.admin_allowlist (email) values ('friend@test.dev')`)), denied);
  await as(SUPER, () => q(`insert into public.admin_allowlist (email) values ('friend@test.dev')`));
  assert.equal(await count(T1, `select * from public.admin_allowlist`), 0);
  await q(`delete from public.admin_allowlist`);
});

test('student numbers: assigned, unique, backfilled, permanent', async () => {
  const rows = await q(`select id, student_number from public.profiles where role = 'learner' order by student_number`);
  assert.ok(rows.every((r) => PATTERNS.studentNumber.test(r.student_number)), JSON.stringify(rows));
  assert.equal(new Set(rows.map((r) => r.student_number)).size, rows.length);
  assert.match((await q(`select student_number from public.profiles where id = '${S3}'`))[0].student_number, /^S-2025-/, 'backfill uses join year');
  assert.match((await q(`select student_number from public.profiles where id = '${T1}'`))[0].student_number, /^S-/, 'a promoted student keeps their number');
  const T3 = '70000000-0000-4000-8000-000000000007';
  await q(`insert into public.admin_allowlist (email) values ('t3@test.dev')`);
  await q(`insert into auth.users (id, email) values ('${T3}', 't3@test.dev')`);
  assert.deepEqual((await q(`select role, student_number from public.profiles where id = '${T3}'`))[0], { role: 'admin', student_number: null }, 'instructor registered from the admin list gets none');
  await db.exec(`delete from public.profiles where id = '${T3}'; delete from auth.users where id = '${T3}'; delete from public.admin_allowlist;`);
  await assert.rejects(as(S1, () => q(`update public.profiles set student_number = 'S-2026-9999' where id = '${S1}'`)), denied);
});

test('students edit their own contact fields; database rejects invalid values', async () => {
  await as(S1, () => q(`update public.profiles set phone = '+63 912 345 6789', address = '12 Rizal St, Manila', school_id = 'JDK-001' where id = '${S1}'`));
  await assert.rejects(as(S1, () => q(`update public.profiles set phone = 'call me' where id = '${S1}'`)), /check/);
  assert.equal(await count(S1, `update public.profiles set phone = '+1 555 0100 22' where id = '${S2}' returning id`), 0);
  assert.equal(await count(T1, `update public.profiles set phone = '+1 555 0100 22' where id = '${S1}' returning id`), 0, 'instructors cannot edit student profiles');
});

test('storage uploads only into modules the instructor owns', async () => {
  await assert.rejects(as(T2, () => q(`insert into storage.objects (name, bucket_id) values ('${mod1}/x.pdf', 'learning-materials')`)), denied);
  await as(T1, () => q(`insert into storage.objects (name, bucket_id) values ('${mod1}/x.pdf', 'learning-materials')`));
  await assert.rejects(as(T1, () => q(`insert into storage.objects (name, bucket_id) values ('not-a-uuid/x.pdf', 'learning-materials')`)), denied);
});

test('enrolled students still reach published content; others do not', async () => {
  await as(T1, () => q(`update public.learning_units set published = true where id = '${unit1}'`));
  assert.equal(await count(S1, `select id from public.learning_units where id = '${unit1}'`), 1);
  assert.equal(await count(S2, `select id from public.learning_units where id = '${unit1}'`), 0);
});

test('a demoted instructor loses access to the courses they own', async () => {
  await as(SUPER, () => q(`update public.profiles set role = 'learner' where id = '${T2}'`));
  assert.equal(await count(T2, `select id from public.learning_modules`), 0);
  assert.equal(await count(T2, `update public.courses set title = 'x' where id = 't2-course' returning id`), 0);
  await as(SUPER, () => q(`update public.profiles set role = 'admin' where id = '${T2}'`));
});

test('validation rules in the app match the database exactly', async () => {
  const samples = {
    phone: ['+63 912 345 6789', '09123456789', '(02) 8123-4567', '123', 'call me', '+1234567890123456789012', ''],
    address: ['12 Rizal St, Manila', 'abc', ' '.repeat(3) + 'abcd', 'x'.repeat(300), 'x'.repeat(301), ''],
    school_id: ['JDK-001', 'a', '-bad', 'has space', 'x'.repeat(40), 'x'.repeat(41), ''],
  };
  const app = { phone: phoneSchema, address: addressSchema, school_id: schoolIdSchema };
  for (const [field, values] of Object.entries(samples)) {
    for (const value of values) {
      const appOk = app[field].safeParse(value).success;
      const stored = app[field].safeParse(value).data ?? null; // empty input is stored as null
      let dbOk = true;
      try {
        await db.exec('begin');
        await db.query(`update public.profiles set ${field} = $1 where id = '${S1}'`, [appOk ? stored : value.trim() === '' ? null : value.trim()]);
      } catch { dbOk = false; } finally { await db.exec('rollback'); }
      assert.equal(appOk, dbOk, `${field} ${JSON.stringify(value)}: app=${appOk} db=${dbOk}`);
    }
  }
});
