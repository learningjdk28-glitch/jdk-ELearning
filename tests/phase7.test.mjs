// Phase 7: invitations (queue, permissions, budget, apply), accounts directory, course roster.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import { DAILY_EMAIL_WARNING, INVITE_HOURLY_BUDGET, inviteActions, parseInviteList, sendingPlan } from '../src/lib/inviteRules.js';

const root = new URL('../', import.meta.url);
const get = (f) => readFileSync(new URL(f, root), 'utf8');
const db = new PGlite();
const q = async (sql) => (await db.query(sql)).rows;
const one = async (sql) => (await q(sql))[0];
const as = async (id, fn) => {
  await db.exec(`set role ${id ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${id || ''}', false);`);
  try { return await fn(); } finally { await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`); }
};
const SUPER = '10000000-0000-4000-8000-000000000001';
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
insert into auth.users (id, email, last_sign_in_at) values ('${SUPER}', 'boss@t.dev', now()), ('${T1}', 't1@t.dev', now()), ('${T2}', 't2@t.dev', now()),
  ('${S1}', 's1@t.dev', now()), ('${S2}', 's2@t.dev', null);
update public.profiles set role = 'admin' where id in ('${SUPER}', '${T1}', '${T2}');
update public.profiles set is_super_admin = true where id = '${SUPER}';
`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));
await as(T2, () => q(`insert into public.courses (id, title, published) values ('other', 'Other', true)`));
const queue = (who, rows, role = 'learner', courses = ['c']) =>
  as(who, () => one(`select public.queue_invites('${JSON.stringify(rows)}'::jsonb, '${role}', array[${courses.map((c) => `'${c}'`).join(',')}]::text[]) r`)).then((r) => r.r);

test('the app and the database use the same hourly email budget', async () => {
  assert.equal((await one('select public.invite_hourly_budget() n')).n, INVITE_HOURLY_BUDGET);
  assert.ok(INVITE_HOURLY_BUDGET < 100, 'leaves room under the 100 an hour Auth limit');
});

test('queueing: valid emails, one open invitation per email, only own courses, only the super admin invites instructors', async () => {
  const r = await queue(T1, [{ email: ' New@Example.com ', name: 'New Person' }, { email: 'bad' }, { email: 'new@example.com' }]);
  assert.equal(r.queued, 1);
  assert.deepEqual(r.skipped.map((s) => s.reason), ['Not a valid email address', 'Already has an open invitation']);
  assert.equal((await one(`select email, display_name, status, course_ids from public.invites`)).email, 'new@example.com');
  await assert.rejects(queue(T1, [{ email: 'x@example.com' }], 'learner', ['other']), /your own courses/);
  await assert.rejects(queue(T1, [{ email: 'y@example.com' }], 'admin', []), /super administrator/);
  assert.equal((await queue(SUPER, [{ email: 'teacher@example.com' }], 'admin', [])).queued, 1);
  await assert.rejects(queue(S1, [{ email: 'z@example.com' }]), /Admin access/);
});

test('invitations are private to who sent them (and the super admin), and cannot be written directly', async () => {
  assert.equal((await as(T1, () => q(`select * from public.list_invites()`))).length, 1);
  assert.equal((await as(T2, () => q(`select * from public.list_invites()`))).length, 0);
  assert.equal((await as(SUPER, () => q(`select * from public.list_invites()`))).length, 2);
  await assert.rejects(as(T1, () => q(`insert into public.invites (email, invited_by) values ('d@example.com', '${T1}')`)), /row-level security/);
  assert.equal((await as(T1, () => q(`update public.invites set status = 'sent' returning id`))).length, 0);
  await assert.rejects(as(S1, () => q(`select * from public.list_invites()`)), /Admin access/);
});

test('the sending helpers are for the Edge Function only', async () => {
  const id = (await one(`select id from public.invites where email = 'new@example.com'`)).id;
  await assert.rejects(as(T1, () => q(`select * from public.claim_invite('${id}', false)`)), /permission denied/);
  await assert.rejects(as(T1, () => q(`select * from public.auth_user_by_email('s1@t.dev')`)), /permission denied/);
  await assert.rejects(as(T1, () => q(`select public.apply_invite('${id}', '${S1}')`)), /permission denied/);
});

test('claiming is one at a time; a stuck send can be taken again after 5 minutes; resend only when asked', async () => {
  const id = (await one(`select id from public.invites where email = 'new@example.com'`)).id;
  assert.equal((await q(`select * from public.claim_invite('${id}', false)`)).length, 1);
  assert.equal((await q(`select * from public.claim_invite('${id}', false)`)).length, 0, 'already sending');
  await q(`update public.invites set claimed_at = now() - interval '6 minutes' where id = '${id}'`);
  assert.equal((await q(`select attempts from public.claim_invite('${id}', false)`))[0].attempts, 2);
  await q(`update public.invites set status = 'sent', sent_at = now() where id = '${id}'`);
  assert.equal((await q(`select * from public.claim_invite('${id}', false)`)).length, 0);
  assert.equal((await q(`select * from public.claim_invite('${id}', true)`)).length, 1, 'resend');
  await q(`update public.invites set status = 'sent' where id = '${id}'`);
});

test('applying an invitation enrolls in its courses; an instructor invitation gives the role and the allow-list entry', async () => {
  const inv = (await one(`select id from public.invites where email = 'new@example.com'`)).id;
  await q(`insert into auth.users (id, email) values ('70000000-0000-4000-8000-000000000007', 'new@example.com')`);
  await q(`select public.apply_invite('${inv}', '70000000-0000-4000-8000-000000000007')`);
  await q(`update public.invites set user_id = '70000000-0000-4000-8000-000000000007' where id = '${inv}'`); // done by the Edge Function
  assert.equal((await one(`select status from public.course_enrollments where course_id = 'c' and user_id = '70000000-0000-4000-8000-000000000007'`)).status, 'active');
  const t = (await one(`select id from public.invites where email = 'teacher@example.com'`)).id;
  await q(`insert into auth.users (id, email) values ('80000000-0000-4000-8000-000000000008', 'teacher@example.com')`);
  await q(`select public.apply_invite('${t}', '80000000-0000-4000-8000-000000000008')`);
  assert.equal((await one(`select role from public.profiles where id = '80000000-0000-4000-8000-000000000008'`)).role, 'admin');
  assert.equal((await one(`select count(*)::int n from public.admin_allowlist where email = 'teacher@example.com'`)).n, 1);
  const found = await q(`select * from public.auth_user_by_email(' NEW@example.com')`);
  assert.equal(found[0].id, '70000000-0000-4000-8000-000000000007');
});

test('an invitation shows as accepted once the person signs in; cancel keeps their access', async () => {
  const before = await as(T1, () => one(`select status from public.list_invites() where email = 'new@example.com'`));
  assert.equal(before.status, 'sent');
  await q(`update auth.users set last_sign_in_at = now() where email = 'new@example.com'`);
  assert.equal((await as(T1, () => one(`select status, accepted_at from public.list_invites('accepted')`))).status, 'accepted');
  const id = (await one(`select id from public.invites where email = 'new@example.com'`)).id;
  await as(T1, () => q(`select public.cancel_invite('${id}')`));
  assert.equal((await one(`select count(*)::int n from public.course_enrollments where course_id = 'c' and user_id = '70000000-0000-4000-8000-000000000007' and status = 'active'`)).n, 1);
  await assert.rejects(as(T2, () => q(`select public.cancel_invite('${id}')`)), /cannot be cancelled/);
});

test('invite stats count the last hour for the budget', async () => {
  const s = await as(T1, () => one(`select public.invite_stats() s`));
  assert.equal(s.s.budget, INVITE_HOURLY_BUDGET);
  assert.ok(Number(s.s.sent_last_hour) >= 1);
});

test('course roster: invited (never signed in) vs active, with pages read; owner only', async () => {
  const mod = (await as(T1, () => q(`insert into public.learning_modules (course_id, title) values ('c', 'M') returning id`)))[0].id;
  const units = [];
  for (let p = 0; p < MODULE_PAGE_COUNT; p++) units.push((await as(T1, () => q(`insert into public.learning_units (module_id, title, content, position) values ('${mod}', 'P', 'B', ${p}) returning id`)))[0].id);
  await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));
  await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S1}'), ('c', '${S2}')`));
  await as(S1, () => q(`insert into public.unit_completions (unit_id, user_id) values ('${units[0]}', '${S1}'), ('${units[1]}', '${S1}')`));
  const rows = await as(T1, () => q(`select * from public.course_roster('c')`));
  const byId = Object.fromEntries(rows.map((r) => [r.user_id, r]));
  assert.deepEqual([byId[S1].signed_in, Number(byId[S1].pages_done), Number(byId[S1].pages_total)], [true, 2, MODULE_PAGE_COUNT]);
  assert.equal(byId[S2].signed_in, false);
  await assert.rejects(as(T2, () => q(`select * from public.course_roster('c')`)), /own courses/);
});

test('the accounts directory shows the student number and searches it', async () => {
  const num = (await one(`select student_number from public.profiles where id = '${S1}'`)).student_number;
  assert.ok(num);
  const rows = await as(T1, () => q(`select * from public.lms_admin_students('${num}')`));
  assert.deepEqual(rows.map((r) => r.student_number), [num]);
});

test('pasted lists: names, emails, headers, duplicates and bad lines', () => {
  const { rows, problems } = parseInviteList('Name,Email\nMaria Santos, Maria@Example.com\njuan@example.com\nmaria@example.com\n\nno email here\nx@y\njoe@ex.com;Joe B');
  assert.deepEqual(rows, [{ email: 'maria@example.com', name: 'Maria Santos' }, { email: 'juan@example.com', name: '' }, { email: 'joe@ex.com', name: 'Joe B' }]);
  assert.deepEqual(problems.map((p) => p.reason), ['Listed twice', 'No email address', 'Not a valid email address']);
  const many = Array.from({ length: 501 }, (_, i) => `p${i}@ex.com`).join('\n');
  assert.equal(parseInviteList(many).rows.length, 500);
});

test('sending plan and actions', () => {
  assert.deepEqual(sendingPlan({ budget: 90, sent_last_hour: 80, sent_today: 10 }, 25), { left: 10, used: 80, budget: 90, sendNow: 10, later: 15, dailyWarning: false });
  assert.equal(sendingPlan({ budget: 90, sent_last_hour: 0, sent_today: DAILY_EMAIL_WARNING }, 1).dailyWarning, true);
  assert.deepEqual(inviteActions('failed'), { retry: true, resend: false, cancel: true });
  assert.deepEqual(inviteActions('accepted'), { retry: false, resend: false, cancel: false });
});
