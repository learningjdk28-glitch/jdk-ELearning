// Extras: retired tables removed, certificate font and QR code, course colour, scheduled invitations.
import { PGlite } from '@electric-sql/pglite';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import {
  DEFAULT_FIELDS, QR_SIZE, certificateText, fieldsError, fontFileError, needsUploadedFont, withAllFields,
} from '../src/lib/certificateRules.js';
import { qrMatrix, renderCertificate } from '../src/lib/certificatePdf.js';
import { BRAND_PRESETS } from '../src/lib/theme.js';

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
await db.exec(`insert into auth.users (id, email) values ('${T1}', 't1@t.dev'), ('${T2}', 't2@t.dev'); update public.profiles set role = 'admin' where id in ('${T1}', '${T2}');`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));

test('the retired lesson tables and their functions are gone; the current ones are untouched', async () => {
  const old = ['lessons', 'questions', 'assessment_attempts', 'assessment_answers', 'competency_results', 'learning_preferences', 'lesson_progress', 'lesson_notes'];
  for (const t of old) assert.equal((await one(`select to_regclass('public.${t}') r`)).r, null, t);
  for (const f of ['sync_attempt', 'reset_my_progress', 'admin_learner_overview']) {
    assert.equal((await one(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = '${f}'`)).n, 0, f);
  }
  for (const t of ['courses', 'profiles', 'learning_modules', 'learning_units', 'unit_completions', 'learning_quiz_attempts', 'lms_certificates']) {
    assert.ok((await one(`select to_regclass('public.${t}') r`)).r, t);
  }
});

test('course colour: owner only, the same values as a profile colour', async () => {
  const ids = /brand_color in \(([^)]+)\)/.exec(get('supabase/migrations/20261124b_extras.sql'))[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(ids, BRAND_PRESETS.map((p) => p.id));
  await as(T1, () => q(`update public.courses set brand_color = 'teal' where id = 'c'`));
  await as(T1, () => q(`update public.courses set brand_color = '#12ab34' where id = 'c'`));
  await assert.rejects(as(T1, () => q(`update public.courses set brand_color = 'pink' where id = 'c'`)), /brand_color_check/);
  assert.equal((await as(T2, () => q(`update public.courses set brand_color = null where id = 'c' returning id`))).length, 0, 'not their course');
  assert.equal((await one(`select brand_color from public.courses where id = 'c'`)).brand_color, '#12ab34');
});

test('the certificate font lives in the course folder; the bucket takes fonts', async () => {
  await as(T1, () => q(`insert into public.certificate_templates (course_id, file_path, file_kind, page_width, page_height) values ('c', 'c/d.png', 'png', 842, 595)`));
  await as(T1, () => q(`update public.certificate_templates set font_path = 'c/font-1.ttf' where course_id = 'c'`));
  await assert.rejects(as(T1, () => q(`update public.certificate_templates set font_path = 'other/font.ttf' where course_id = 'c'`)), /font_path_check/);
  const b = await one(`select allowed_mime_types from storage.buckets where id = 'certificate-templates'`);
  assert.ok(b.allowed_mime_types.includes('font/ttf') && b.allowed_mime_types.includes('font/otf'));
});

test('invitation stats say whether the 5-minute schedule is on (off without pg_cron)', async () => {
  assert.equal((await as(T1, () => one(`select public.invite_stats() s`))).s.scheduled, false);
});

test('the schedule script and the Edge Function use the same secret header and mode', () => {
  const setup = get('supabase/setup/invite_schedule.sql');
  const fn = get('supabase/functions/invite-users/index.ts');
  assert.match(setup, /'x-cron-secret'/);
  assert.match(setup, /"mode":"queue"/);
  assert.match(fn, /request\.headers\.get\('x-cron-secret'\) !== cronSecret/);
  assert.match(fn, /body\?\.mode === 'queue'/);
  assert.match(fn, /if \(!cronSecret \|\|/, 'without CRON_SECRET the queue mode is refused');
  assert.doesNotMatch(setup, /eyJ|sb_secret|service_role/i, 'no keys written in the file');
});

test('new certificate fields start hidden on designs saved before them; QR and font rules', () => {
  const old = DEFAULT_FIELDS.filter((f) => f.key !== 'qr');
  assert.equal(withAllFields(old).find((f) => f.key === 'qr').enabled, false, 'an old design does not suddenly get a QR code');
  assert.equal(withAllFields([]).find((f) => f.key === 'qr').enabled, true, 'a new design starts with one');
  assert.equal(fieldsError(DEFAULT_FIELDS), '');
  assert.match(fieldsError(DEFAULT_FIELDS.map((f) => (f.key === 'qr' ? { ...f, size: QR_SIZE[1] + 1 } : f))), /QR code/);
  assert.match(fieldsError(DEFAULT_FIELDS.map((f) => (f.key === 'student_name' ? { ...f, font: 'Custom' } : f))), /upload a font file/);
  assert.equal(fieldsError(DEFAULT_FIELDS.map((f) => (f.key === 'student_name' ? { ...f, font: 'Custom' } : f)), { hasFont: true }), '');
  assert.deepEqual(['Ana Reyes', 'José Peña', '王小明', 'Иван', 'محمد'].map(needsUploadedFont), [false, false, true, true, true]);
  assert.equal(fontFileError({ name: 'NotoSansSC.ttf', size: 9e6 }), '');
  assert.match(fontFileError({ name: 'font.woff2', size: 10 }), /\.ttf or \.otf/);
  assert.match(fontFileError({ name: 'big.otf', size: 21 * 1024 * 1024 }), /20 MB/);
  assert.equal(certificateText({ code: 'JDK-1A2B-3C4D-5E6F' }, 'https://x.dev').qr, 'https://x.dev/verify/JDK-1A2B-3C4D-5E6F');
});

const design = async () => { const d = await PDFDocument.create(); d.addPage([842, 595]); return d.save(); };
const template = { file_kind: 'pdf', page_width: 842, page_height: 595, fields: DEFAULT_FIELDS };

test('a real PDF with a QR code', async () => {
  const m = await qrMatrix('https://x.dev/verify/JDK-1A2B-3C4D-5E6F');
  assert.ok(m.size >= 21 && m.dark(0, 0), 'a QR code with its corner finder pattern');
  const bytes = await design();
  const withQr = await renderCertificate(template, bytes, certificateText({ student_name: 'Ana', course_title: 'C', issued_at: '2026-11-14T00:00:00Z', code: 'JDK-1A2B-3C4D-5E6F' }, 'https://x.dev'));
  const without = await renderCertificate({ ...template, fields: DEFAULT_FIELDS.map((f) => (f.key === 'qr' ? { ...f, enabled: false } : f)) }, bytes,
    certificateText({ student_name: 'Ana', course_title: 'C', issued_at: '2026-11-14T00:00:00Z', code: 'JDK-1A2B-3C4D-5E6F' }, 'https://x.dev'));
  assert.ok(withQr.length > without.length, 'the QR squares were drawn');
  assert.equal((await PDFDocument.load(withQr)).getPageCount(), 1);
});

const FONT = 'C:/Windows/Fonts/arial.ttf';
test('an uploaded font prints names the built-in fonts cannot', { skip: !existsSync(FONT) && 'no test font on this machine' }, async () => {
  const fontBytes = new Uint8Array(readFileSync(FONT));
  const text = certificateText({ student_name: 'Иван Нгуễн', course_title: 'C', issued_at: '2026-11-14T00:00:00Z', code: 'JDK-1A2B-3C4D-5E6F' }, 'https://x.dev');
  const pdf = await renderCertificate(template, await design(), text, 'Font test', fontBytes);
  const doc = await PDFDocument.load(pdf);
  assert.equal(doc.getPageCount(), 1);
  assert.ok(pdf.length > 5000, 'the font subset is embedded');
});

test('analytics views for the chatbot: current data, anonymous, read-only, nothing else readable', async () => {
  const S = '40000000-0000-4000-8000-000000000004';
  await db.exec(`insert into auth.users (id, email) values ('${S}', 'private.person@example.com')`);
  const mod = (await one(`insert into public.learning_modules (course_id, title) values ('c', 'M1') returning id`)).id;
  const unit = (await one(`insert into public.learning_units (module_id, title, content, position) values ('${mod}', 'P', 'B', 0) returning id`)).id;
  const quiz = (await one(`insert into public.learning_quizzes (module_id, title, published) values ('${mod}', 'Q', true) returning id`)).id;
  const qq = (await one(`insert into public.learning_quiz_questions (quiz_id, prompt, options, correct_index, competency) values ('${quiz}', 'Q?', '["a","b"]', 1, 2) returning id`)).id;
  await db.exec(`
    insert into public.course_enrollments (course_id, user_id) values ('c', '${S}');
    insert into public.unit_completions (unit_id, user_id) values ('${unit}', '${S}');
    insert into public.learning_quiz_attempts (quiz_id, user_id, correct_count, question_count, score, passed, answers)
      values ('${quiz}', '${S}', 1, 1, 100, true, '[{"questionId":"${qq}","choice":1}]');
    insert into public.pretest_attempts (course_id, user_id, stage, correct_count, question_count, score, modules)
      values ('c', '${S}', 'pre', 1, 4, 25, '[{"module_id":"${mod}","title":"M1","correct":1,"total":4}]');
    insert into public.study_time (user_id, module_id, day, seconds) values ('${S}', '${mod}', current_date, 600);`);

  const asAnalytics = async (fn) => { await db.exec('set role analytics_ro'); try { return await fn(); } finally { await db.exec('reset role'); } };
  const attempts = await asAnalytics(() => q('select * from analytics.quiz_attempts'));
  assert.equal(attempts.length, 1);
  assert.match(attempts[0].learner_ref, /^[0-9a-f]{8}$/);
  const answers = await asAnalytics(() => q('select * from analytics.quiz_answers'));
  assert.deepEqual([answers[0].is_correct, answers[0].skipped, answers[0].competency_name], [true, false, 'Practical Application']);
  assert.equal(Number((await asAnalytics(() => one("select pages from analytics.modules where course_id = 'c'"))).pages), 1);
  assert.equal(Number((await asAnalytics(() => one('select score_pct from analytics.pretest_module_scores'))).score_pct), 25);
  assert.equal(Number((await asAnalytics(() => one('select minutes from analytics.study_time'))).minutes), 10);
  assert.equal((await asAnalytics(() => q('select * from analytics.page_reads'))).length, 1);

  const cols = await q(`select table_name, column_name from information_schema.columns where table_schema = 'analytics'`);
  assert.ok(cols.length > 40);
  assert.deepEqual(cols.filter((c) => /email|display_name|student_number|body|link_url|feedback|user_id|password|file_path/.test(c.column_name)), [], 'no personal data');
  await assert.rejects(asAnalytics(() => q('select * from public.profiles')), /permission denied/);
  await assert.rejects(asAnalytics(() => q('select email from auth.users')), /permission denied/);
  await assert.rejects(asAnalytics(() => db.exec('create table analytics.x (a int)')), /permission denied/);
  await assert.rejects(as(null, () => q('select * from analytics.quiz_attempts')), /permission denied/, 'the app roles cannot read it');
  await assert.rejects(as(S, () => q('select * from analytics.quiz_attempts')), /permission denied/);
  const setting = await one(`select array_to_string(setconfig, ',') c from pg_db_role_setting s join pg_roles r on r.oid = s.setrole where r.rolname = 'analytics_ro'`);
  assert.match(setting.c, /default_transaction_read_only=on/);
  assert.match(setting.c, /statement_timeout=5s/);
});
