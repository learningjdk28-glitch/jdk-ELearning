// Phase 5a: assignments, submissions (link / file / text), on-time vs late, grading, storage.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_SUBMISSION_BYTES, SUBMISSION_FILE_TYPES, dueLabel, fileError, linkError, mimeFor, safeFileName, submissionStatus } from '../src/lib/submissionRules.js';

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
const make = async (fields) => (await as(T1, () => q(`insert into public.assignments (course_id, title, due_at, published ${fields.cols || ''})
  values ('c', 'Essay', ${fields.due}, true ${fields.vals || ''}) returning id`)))[0].id;
const open = await make({ due: `now() + interval '2 days'` });
const pastLate = await make({ due: `now() - interval '1 day'` });
const pastClosed = await make({ due: `now() - interval '1 day'`, cols: ', allow_late', vals: ', false' });
const linkOnly = await make({ due: `now() + interval '1 day'`, cols: ', submission_types', vals: `, array['link']` });
const handIn = (who, a, cols = `kind, link_url`, vals = `'link', 'https://youtu.be/x'`) =>
  as(who, () => q(`insert into public.assignment_submissions (assignment_id, user_id, ${cols}) values ('${a}', '${who}', ${vals}) returning *`)).then((r) => r[0]);

test('app, database and storage bucket agree on the 50 MB file limit and the file types', async () => {
  assert.equal(Number((await one('select public.max_submission_bytes() n')).n), MAX_SUBMISSION_BYTES);
  const bucket = await one(`select file_size_limit, allowed_mime_types from storage.buckets where id = 'submissions'`);
  assert.equal(Number(bucket.file_size_limit), MAX_SUBMISSION_BYTES);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), SUBMISSION_FILE_TYPES.map((t) => t.mime).sort());
});

test('on time vs late is decided by the server clock, not the client', async () => {
  const s = await as(S1, () => q(`insert into public.assignment_submissions (assignment_id, user_id, kind, link_url, submitted_at, is_late)
    values ('${open}', '${S1}', 'link', 'https://x.dev', '2000-01-01', true) returning is_late, submitted_at`));
  assert.equal(s[0].is_late, false, 'client cannot mark itself late or early');
  assert.ok(new Date(s[0].submitted_at).getFullYear() > 2000);
  assert.equal((await handIn(S1, pastLate)).is_late, true);
});

test('a closed assignment refuses late work; a link-only assignment refuses files', async () => {
  await assert.rejects(handIn(S1, pastClosed), /does not accept late work/);
  await assert.rejects(handIn(S1, linkOnly, 'kind, file_path, file_name, file_size', `'file', '${linkOnly}/${S1}/a.pdf', 'a.pdf', 10`), /does not accept file/);
});

test('only enrolled students hand in, only for themselves, only to published assignments', async () => {
  await assert.rejects(handIn(S2, open), /row-level security/, 'not enrolled');
  await assert.rejects(as(S3, () => q(`insert into public.assignment_submissions (assignment_id, user_id, kind, link_url) values ('${open}', '${S1}', 'link', 'https://x.dev')`)), /row-level security|duplicate/);
  const draft = (await as(T1, () => q(`insert into public.assignments (course_id, title, due_at) values ('c', 'Draft', now() + interval '1 day') returning id`)))[0].id;
  await assert.rejects(handIn(S1, draft), /row-level security/);
});

test('a file submission must live in the student\'s own folder of that assignment', async () => {
  await assert.rejects(handIn(S3, open, 'kind, file_path, file_name, file_size', `'file', '${open}/${S1}/a.pdf', 'a.pdf', 10`), /File path/);
  const s = await handIn(S3, open, 'kind, file_path, file_name, file_size, mime_type', `'file', '${open}/${S3}/a.pdf', 'a.pdf', 1000, 'application/pdf'`);
  assert.equal(s.kind, 'file');
  await assert.rejects(handIn(S3, pastLate, 'kind, file_path, file_name, file_size', `'file', '${pastLate}/${S3}/b.pdf', 'b.pdf', ${MAX_SUBMISSION_BYTES + 1}`), /check/);
});

test('storage: students upload only to their own folder of an open assignment; teachers read their course files', async () => {
  await as(S1, () => q(`insert into storage.objects (name, bucket_id) values ('${open}/${S1}/x.pdf', 'submissions')`));
  await assert.rejects(as(S1, () => q(`insert into storage.objects (name, bucket_id) values ('${open}/${S3}/x.pdf', 'submissions')`)), /row-level security/);
  await assert.rejects(as(S1, () => q(`insert into storage.objects (name, bucket_id) values ('${pastClosed}/${S1}/x.pdf', 'submissions')`)), /row-level security/);
  assert.equal((await as(T1, () => q(`select name from storage.objects where bucket_id = 'submissions'`))).length, 1);
  assert.equal((await as(T2, () => q(`select name from storage.objects where bucket_id = 'submissions'`))).length, 0);
  assert.equal((await as(S3, () => q(`select name from storage.objects where bucket_id = 'submissions'`))).length, 0);
});

test('grading: only the course owner, within max points; the student cannot touch the grade', async () => {
  const sub = (await q(`select id from public.assignment_submissions where assignment_id = '${open}' and user_id = '${S1}'`))[0].id;
  await assert.rejects(as(T1, () => q(`update public.assignment_submissions set score = 101 where id = '${sub}'`)), /between 0 and 100/);
  await as(T1, () => q(`update public.assignment_submissions set score = 88, feedback = 'Good work' where id = '${sub}'`));
  const g = await one(`select score, feedback, graded_by, graded_at from public.assignment_submissions where id = '${sub}'`);
  assert.deepEqual([Number(g.score), g.feedback, g.graded_by, g.graded_at !== null], [88, 'Good work', T1, true]);
  assert.equal((await as(T2, () => q(`update public.assignment_submissions set score = 1 where id = '${sub}' returning id`))).length, 0);
  await assert.rejects(as(S1, () => q(`update public.assignment_submissions set link_url = 'https://new.dev' where id = '${sub}'`)), /graded/);
});

test('instructors cannot change what a student handed in; students may replace work until it is graded', async () => {
  const sub = (await q(`select id from public.assignment_submissions where assignment_id = '${pastLate}' and user_id = '${S1}'`))[0].id;
  await assert.rejects(as(T1, () => q(`update public.assignment_submissions set link_url = 'https://edited.dev' where id = '${sub}'`)), /grade a submission but not change/);
  await as(S1, () => q(`update public.assignment_submissions set link_url = 'https://better.dev' where id = '${sub}'`));
  assert.equal((await one(`select link_url from public.assignment_submissions where id = '${sub}'`)).link_url, 'https://better.dev');
});

test('roster lists every enrolled student with or without a submission, owner only', async () => {
  const rows = await as(T1, () => q(`select user_id, submission_id, is_late from public.assignment_roster('${pastLate}')`));
  assert.deepEqual(rows.map((r) => [r.user_id, r.submission_id !== null]).sort(), [[S1, true], [S3, false]].sort());
  await assert.rejects(as(T2, () => q(`select * from public.assignment_roster('${pastLate}')`)), /own courses/);
  await assert.rejects(as(S1, () => q(`select * from public.assignment_roster('${pastLate}')`)), /own courses/);
});

test('storage usage counts course files and the whole project, owner only', async () => {
  const u = (await as(T1, () => q(`select public.storage_usage('c') u`)))[0].u;
  assert.equal(Number(u.course_bytes), 1000);
  assert.ok(Number(u.project_bytes) >= 1000);
  await assert.rejects(as(T2, () => q(`select public.storage_usage('c')`)), /own courses/);
});

test('file checks run before upload, with a link suggestion for big videos', () => {
  const f = (name, size, type = '') => ({ name, size, type });
  assert.equal(fileError(f('essay.pdf', 1000, 'application/pdf')), '');
  assert.match(fileError(f('talk.mp4', MAX_SUBMISSION_BYTES + 1, 'video/mp4')), /YouTube or Google Drive/);
  assert.match(fileError(f('big.pdf', MAX_SUBMISSION_BYTES + 1, 'application/pdf')), /compressing/);
  assert.match(fileError(f('virus.exe', 10, 'application/x-msdownload')), /not accepted/);
  assert.match(fileError(f('empty.txt', 0, 'text/plain')), /empty/);
  assert.equal(mimeFor(f('photo.JPG', 10)), 'image/jpeg', 'falls back to the extension');
  assert.match(linkError('http://insecure'), /https/);
  assert.equal(safeFileName('My Essay (final)!.pdf'), 'My_Essay_final_.pdf');
});

test('status and deadline labels', () => {
  const now = new Date('2026-01-10T12:00:00Z');
  const a = { due_at: '2026-01-12T12:00:00Z', max_points: 100, allow_late: true };
  assert.equal(submissionStatus(a, null, now).id, 'open');
  assert.equal(submissionStatus({ ...a, due_at: '2026-01-09T12:00:00Z' }, null, now).id, 'overdue');
  assert.equal(submissionStatus({ ...a, due_at: '2026-01-09T12:00:00Z', allow_late: false }, null, now).id, 'closed');
  assert.equal(submissionStatus(a, { is_late: true, score: null }, now).label, 'Submitted late');
  assert.equal(submissionStatus(a, { is_late: false, score: 90 }, now).label, 'Graded: 90 / 100');
  assert.equal(dueLabel('2026-01-12T12:00:00Z', now), 'Due in 2 days');
  assert.equal(dueLabel('2026-01-10T09:00:00Z', now), 'Was due 3 hours ago');
});
