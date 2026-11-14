import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const sql = readFileSync(new URL('../supabase_setup.sql', import.meta.url), 'utf8');
const db = new PGlite();
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`);
  cond ? pass++ : fail++;
};
const throws = async (name, fn, re) => {
  try {
    await fn();
    ok(name, false, 'did not throw');
  } catch (e) {
    ok(name, re ? re.test(e.message) : true, e.message.slice(0, 90));
  }
};

// ---- Supabase-like environment ----
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create publication supabase_realtime;
  grant usage on schema auth, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on functions to anon, authenticated;
`);

// ---- Run the script twice: must not error, must be idempotent ----
try {
  await db.exec(sql);
  ok('script runs top to bottom without errors', true);
  await db.exec(sql);
  ok('script is safe to re-run', true);
} catch (e) {
  ok('script runs', false, e.message);
  throw e;
}
await db.exec(`grant all on all tables in schema public to anon, authenticated;`);

const as = async (uid, fn) => {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}; select set_config('request.jwt.claim.sub', '${uid || ''}', false);`);
  try {
    return await fn();
  } finally {
    await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
  }
};
const q = (s, p) => db.query(s, p).then((r) => r.rows);

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
await db.exec(`
  insert into auth.users (id, email, raw_user_meta_data) values
   ('${A}', 'a@x.com', '{"display_name":"Alice","role":"admin"}'),
   ('${B}', 'b@x.com', '{}'),
   ('${C}', 'c@x.com', '{}');
`);

// ---- Signup trigger and role safety ----
const profiles = await q('select id, display_name, role from public.profiles order by email_sort', []).catch(() => q('select id, display_name, role from public.profiles order by display_name'));
ok('profile row created for each signup', profiles.length === 3);
ok('signup metadata role=admin is ignored (stays learner)', profiles.find((p) => p.id === A).role === 'learner');
ok('display name taken from metadata', profiles.find((p) => p.id === A).display_name === 'Alice');

await throws('learner cannot promote themselves to admin', () => as(A, () => db.exec(`update public.profiles set role='admin' where id='${A}'`)), /administrator/);
await db.exec(`update public.profiles set role='admin' where id='${C}'`);
ok('SQL Editor (no signed-in user) can promote an admin', (await q(`select role from public.profiles where id='${C}'`))[0].role === 'admin');
// ---- Administrator email list ----
const D = '44444444-4444-4444-8444-444444444444';
const E = '55555555-5555-4555-8555-555555555555';
await db.exec(`insert into public.admin_allowlist (email) values ('teacher@x.com')`);
await db.exec(`insert into auth.users (id, email) values ('${D}', 'Teacher@X.com')`);
ok('allowlisted email registers as admin (case-insensitive)', (await q(`select role from public.profiles where id='${D}'`))[0].role === 'admin');
await db.exec(`insert into auth.users (id, email) values ('${E}', 'later@x.com')`);
ok('email not on the list registers as learner', (await q(`select role from public.profiles where id='${E}'`))[0].role === 'learner');
await db.exec(`insert into public.admin_allowlist (email) values ('later@x.com')`);
ok('adding an existing account to the list promotes it', (await q(`select role from public.profiles where id='${E}'`))[0].role === 'admin');
ok('learner cannot read the admin list', (await as(B, () => q('select * from public.admin_allowlist'))).length === 0);
await throws('learner cannot add themselves to the admin list', () => as(B, () => db.exec(`insert into public.admin_allowlist (email) values ('b@x.com')`)));
await throws('admin list rejects non-lowercase emails', () => db.exec(`insert into public.admin_allowlist (email) values ('Mixed@X.com')`), /check/);
await db.exec(`delete from public.profiles where id in ('${D}', '${E}'); delete from auth.users where id in ('${D}', '${E}'); delete from public.admin_allowlist;`);

await throws('learner cannot insert an admin profile', () => as(B, () => db.exec(`insert into public.profiles (id, role) values (gen_random_uuid(), 'admin')`)));
await as(A, () => db.exec(`update public.profiles set display_name='Alice Z' where id='${A}'`));
ok('learner can edit own display name', (await q(`select display_name from public.profiles where id='${A}'`))[0].display_name === 'Alice Z');
await throws('display name length constraint (61 chars)', () => as(A, () => db.exec(`update public.profiles set display_name='${'x'.repeat(61)}' where id='${A}'`)), /check/);

// ---- sync_attempt RPC ----
const attemptId = '99999999-9999-4999-8999-999999999999';
const qs = await q(`select id, correct_index from public.questions where kind='diagnostic' order by id limit 4`);
const payload = {
  id: attemptId, course_id: 'digital-literacy', lesson_id: null, kind: 'diagnostic', level: null,
  created_at: '2026-01-01T10:00:00Z',
  // First two correct, third wrong, fourth unanswered. Client also lies with is_correct:true.
  answers: [
    { question_id: qs[0].id, selected_index: qs[0].correct_index, is_correct: false },
    { question_id: qs[1].id, selected_index: qs[1].correct_index },
    { question_id: qs[2].id, selected_index: (qs[2].correct_index + 1) % 4, is_correct: true },
    { question_id: qs[3].id, selected_index: null },
  ],
};
await as(A, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify(payload)]));
await as(A, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify(payload)]));
ok('sync_attempt twice makes 1 attempt (no duplicates)', (await q(`select count(*)::int n from public.assessment_attempts`))[0].n === 1);
ok('sync_attempt twice makes 4 answer rows', (await q(`select count(*)::int n from public.assessment_answers`))[0].n === 4);
const wrongClaim = await q(`select is_correct from public.assessment_answers where question_id='${qs[2].id}'`);
ok('server recomputes correctness (client claim ignored)', wrongClaim[0].is_correct === false);
const att = (await q(`select total_answered, total_correct from public.assessment_attempts`))[0];
ok('attempt totals: 3 answered, 2 correct', att.total_answered === 3 && att.total_correct === 2, JSON.stringify(att));
const res = await q(`select competency, answered, correct, score from public.competency_results order by competency`);
ok('competency results rows created and non-duplicated', res.length >= 1 && res.every((r) => Number(r.answered) > 0), JSON.stringify(res));

await throws('lesson attempt without lesson_id violates check', () => as(A, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify({ ...payload, id: '88888888-8888-4888-8888-888888888888', kind: 'lesson' })])), /check|violates/);
await throws('other user cannot overwrite my attempt id', () => as(B, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify(payload)])), /row-level security|policy|violates/);
await throws('anon cannot call sync_attempt', () => as(null, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify(payload)])), /permission denied/);

// ---- RLS isolation ----
ok('owner sees own attempt', (await as(A, () => q('select id from public.assessment_attempts'))).length === 1);
ok('other learner sees none of it', (await as(B, () => q('select id from public.assessment_attempts'))).length === 0);
ok('other learner sees no answers or results', (await as(B, () => q('select 1 from public.assessment_answers union all select 1 from public.competency_results'))).length === 0);
ok('anon reads zero attempts (no anon policy)', (await as(null, () => q('select id from public.assessment_attempts'))).length === 0);
await throws('learner cannot insert answers into another users attempt', () => as(B, () => db.query(`insert into public.assessment_answers (attempt_id, question_id, user_id, selected_index, is_correct) values ($1, $2, $3, 0, false)`, [attemptId, qs[3].id, B])), /row-level security/);
await throws('learner cannot insert attempt as someone else', () => as(B, () => db.exec(`insert into public.assessment_attempts (id, user_id, course_id, kind) values (gen_random_uuid(), '${A}', 'digital-literacy', 'diagnostic')`)), /row-level security/);
await throws('learner cannot edit course content', () => as(B, () => db.exec(`update public.questions set explanation='hacked'`).then(async () => { const r = await q(`select count(*)::int n from public.questions where explanation='hacked'`); if (r[0].n) throw new Error('content modified'); throw new Error('no rows updated by RLS'); })), /no rows updated|content modified/);
ok('learner can read course content (5 lessons + 4 modules)', (await as(B, () => q('select id from public.lessons'))).length === 9);
ok('94 questions seeded (46 + 48 module questions)', (await q('select count(*)::int n from public.questions'))[0].n === 94);

// ---- Preferences and progress ----
await as(B, () => db.exec(`insert into public.learning_preferences (user_id, learning_mode) values ('${B}', 'Visual') on conflict (user_id) do update set learning_mode = excluded.learning_mode`));
await throws('invalid learning mode rejected', () => as(B, () => db.exec(`update public.learning_preferences set learning_mode='Telepathy' where user_id='${B}'`)), /check/);
await as(B, () => db.exec(`insert into public.lesson_progress (user_id, lesson_id, completed, completed_at) values ('${B}', 'basics', true, now()) on conflict (user_id, lesson_id) do update set completed = true`));
await as(B, () => db.exec(`insert into public.lesson_progress (user_id, lesson_id, completed, completed_at) values ('${B}', 'basics', true, now()) on conflict (user_id, lesson_id) do update set completed = true`));
ok('lesson_progress upsert twice keeps 1 row', (await q(`select count(*)::int n from public.lesson_progress`))[0].n === 1);
await throws('cannot write progress for another user', () => as(B, () => db.exec(`insert into public.lesson_progress (user_id, lesson_id) values ('${A}', 'safety')`)), /row-level security/);

// ---- updated_at trigger ----
const before = (await q(`select updated_at from public.learning_preferences where user_id='${B}'`))[0].updated_at;
await new Promise((r) => setTimeout(r, 20));
await as(B, () => db.exec(`update public.learning_preferences set learning_mode='Read/Write' where user_id='${B}'`));
const after = (await q(`select updated_at from public.learning_preferences where user_id='${B}'`))[0].updated_at;
ok('updated_at trigger advances on update', new Date(after) > new Date(before));

// ---- Admin overview ----
const adminRows = await as(C, () => q('select * from public.admin_learner_overview()'));
ok('admin overview lists all 3 learners', adminRows.length === 3, String(adminRows.length));
ok('admin overview counts attempts and lessons', Number(adminRows.find((r) => r.user_id === A).attempts) === 1 && Number(adminRows.find((r) => r.user_id === B).lessons_completed) === 1);
ok('non-admin overview shows only themself', (await as(B, () => q('select * from public.admin_learner_overview()'))).length === 1);
ok('admin can read all attempts', (await as(C, () => q('select id from public.assessment_attempts'))).length === 1);
await throws('admin cannot write learner data as someone else', () => as(C, () => db.exec(`insert into public.lesson_progress (user_id, lesson_id) values ('${A}', 'safety')`)), /row-level security/);
await as(C, () => db.exec(`update public.questions set explanation = explanation where id = '${qs[0].id}'`));
ok('admin can update content', true);

// ---- Reset ----
await as(A, () => db.exec(`select public.reset_my_progress()`));
ok('reset_my_progress removes my attempts, answers and results', (await q(`select (select count(*) from public.assessment_attempts)::int a, (select count(*) from public.assessment_answers)::int b, (select count(*) from public.competency_results)::int c`))[0].a === 0);
ok('reset does not touch another learner', (await q(`select count(*)::int n from public.lesson_progress`))[0].n === 1);

// ---- Module quiz (file-based Networking Basics course) ----
const modQs = await q(`select id, correct_index, competency from public.questions where lesson_id='nb-m1' order by id`);
ok('nb-m1 has 12 questions, 3 per competency', modQs.length === 12 && [0, 1, 2, 3].every((c) => modQs.filter((x) => x.competency === c).length === 3));
const modId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
// 3 of 3 right in competency 0, 2 of 3 in 1, 1 of 3 in 2, 0 of 3 in 3 (client also lies about correctness)
const wantRight = { 0: 3, 1: 2, 2: 1, 3: 0 };
const seen = { 0: 0, 1: 0, 2: 0, 3: 0 };
const modPayload = {
  id: modId, course_id: 'networking-basics', lesson_id: 'nb-m1', kind: 'module', level: null, created_at: '2026-02-01T10:00:00Z',
  answers: modQs.map((x) => {
    const right = seen[x.competency]++ < wantRight[x.competency];
    return { question_id: x.id, selected_index: right ? x.correct_index : (x.correct_index + 1) % 4, is_correct: true };
  }),
};
await as(B, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify(modPayload)]));
await as(B, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify(modPayload)]));
ok('module attempt saved once after two syncs', (await q(`select count(*)::int n from public.assessment_attempts where id='${modId}'`))[0].n === 1);
const modAtt = (await q(`select kind, lesson_id, course_id, total_answered, total_correct from public.assessment_attempts where id='${modId}'`))[0];
ok('module attempt totals: 12 answered, 6 correct', modAtt.kind === 'module' && modAtt.lesson_id === 'nb-m1' && modAtt.course_id === 'networking-basics' && modAtt.total_answered === 12 && modAtt.total_correct === 6, JSON.stringify(modAtt));
const modRes = await q(`select competency, answered, correct, score from public.competency_results where attempt_id='${modId}' order by competency`);
ok('module results: 3/3, 2/3, 1/3, 0/3 per competency', modRes.length === 4 && modRes.map((r) => r.correct).join() === '3,2,1,0' && modRes.every((r) => r.answered === 3), JSON.stringify(modRes));
ok('module score 66.67 for 2 of 3', Number(modRes[1].score) === 66.67);
await throws('module attempt without a module id is rejected', () => as(B, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify({ ...modPayload, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', lesson_id: null })])), /check|violates/);
await throws('unknown kind is rejected', () => as(B, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify({ ...modPayload, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', kind: 'exam' })])), /check|violates/);
await as(B, () => db.exec(`insert into public.lesson_progress (user_id, lesson_id, completed, completed_at) values ('${B}', 'nb-m1', true, now()) on conflict (user_id, lesson_id) do update set completed = true`));
ok('module completion is stored in lesson_progress', (await q(`select count(*)::int n from public.lesson_progress where user_id='${B}' and lesson_id='nb-m1'`))[0].n === 1);
await as(B, () => db.exec(`select public.reset_my_progress()`));
ok('reset also removes module attempts and results', (await q(`select (select count(*) from public.assessment_attempts where id='${modId}')::int a, (select count(*) from public.competency_results where attempt_id='${modId}')::int b`))[0].a === 0);
// restore B's progress row expected by the later notes checks (progress was reset above)

// ---- Lesson notes ----
const upsertNote = (uid, body) => as(uid, () => db.query(`insert into public.lesson_notes (user_id, lesson_id, body) values ($1, 'basics', $2) on conflict (user_id, lesson_id) do update set body = excluded.body`, [uid, body]));
await upsertNote(B, 'first');
await upsertNote(B, 'second');
ok('notes upsert twice keeps 1 row with latest text', (await q(`select body from public.lesson_notes where user_id='${B}'`)).length === 1 && (await q(`select body from public.lesson_notes where user_id='${B}'`))[0].body === 'second');
ok('other learner cannot read my notes', (await as(A, () => q('select 1 from public.lesson_notes'))).length === 0);
await throws('note longer than 4000 chars rejected', () => upsertNote(B, 'x'.repeat(4001)), /check/);
await throws('cannot write a note for another user', () => as(B, () => db.exec(`insert into public.lesson_notes (user_id, lesson_id, body) values ('${A}', 'basics', 'hi')`)), /row-level security/);
await as(B, () => db.exec('select public.reset_my_progress()'));
ok('reset_my_progress also deletes my notes', (await q('select count(*)::int n from public.lesson_notes'))[0].n === 0);

// ---- Every table has RLS enabled ----
const noRls = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity`);
ok('RLS enabled on every public table', noRls.length === 0, noRls.map((r) => r.relname).join(','));
const tablesWithoutPolicy = await q(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not exists (select 1 from pg_policy p where p.polrelid=c.oid)`);
ok('every table has at least one policy', tablesWithoutPolicy.length === 0, tablesWithoutPolicy.map((r) => r.relname).join(','));
const pub = await q(`select tablename from pg_publication_tables where pubname='supabase_realtime'`);
ok('realtime publication includes 5 tables', pub.length === 5, pub.map((r) => r.tablename).join(','));

// ---- Chatbot analytics layer (supabase_analytics.sql) ----
const analyticsSql = readFileSync(new URL('../supabase_analytics.sql', import.meta.url), 'utf8');
try {
  await db.exec(analyticsSql);
  await db.exec(analyticsSql);
  ok('analytics script runs twice without errors', true);
} catch (e) {
  ok('analytics script runs twice without errors', false, e.message);
}
await db.exec(`update auth.users set email = 'private.person@example.com' where id = '${B}'`);
await as(B, () => db.query('select public.sync_attempt($1::jsonb)', [JSON.stringify({ ...modPayload, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })]));
const asAnalytics = async (fn) => { await db.exec('set role analytics_ro'); try { return await fn(); } finally { await db.exec('reset role'); } };
const viewRows = await asAnalytics(() => q('select * from analytics.attempts'));
ok('analytics role can read the attempts view', viewRows.length === 1 && viewRows[0].total_answered === 12, JSON.stringify(viewRows[0] || {}));
ok('learner is anonymous: 8 character reference, no email or name column', /^[0-9a-f]{8}$/.test(viewRows[0].learner_ref) && !Object.keys(viewRows[0]).some((k) => /email|name|user_id/.test(k)));
const allCols = await q(`select column_name from information_schema.columns where table_schema='analytics'`);
ok('no analytics view exposes email, display name or notes', !allCols.some((c) => /email|display_name|body|user_id|password/.test(c.column_name)), allCols.map((c) => c.column_name).filter((c) => /email|display_name|body|user_id/.test(c)).join(','));
ok('competency view labels the four areas', (await asAnalytics(() => q('select distinct competency_name from analytics.competency_scores'))).length >= 1);
await throws('analytics role cannot read public tables', () => asAnalytics(() => q('select * from public.profiles')), /permission denied/);
await throws('analytics role cannot read auth users', () => asAnalytics(() => q('select email from auth.users')), /permission denied/);
await throws('analytics role cannot write', () => asAnalytics(() => db.exec(`delete from analytics.attempts`)), /permission denied|read-only|cannot delete/);
await throws('analytics role cannot create objects', () => asAnalytics(() => db.exec('create table analytics.x (a int)')), /permission denied/);
await throws('anon cannot read analytics', () => as(null, () => q('select * from analytics.attempts')), /permission denied/);
ok('analytics role is read-only with a statement limit', (await q(`select array_to_string(setconfig, ',') c from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname='analytics_ro'`))[0].c.includes('default_transaction_read_only=on'));

console.log(`\n${pass}/${pass + fail} passed`);
test('supabase_setup.sql passes every database check', () => assert.equal(fail, 0, fail + ' database checks failed'));
