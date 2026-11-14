// Phase 9: certificate designs, codes, claiming, issuing, revoking, public verification, storage, and the PDF itself.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import {
  DEFAULT_FIELDS, MAX_TEMPLATE_BYTES, TEMPLATE_TYPES, anchorX, certificateText, fieldsError, fitSize, imagePageSize, pdfSafeText, templateFileError, verifyUrl, withAllFields,
} from '../src/lib/certificateRules.js';
import { measureTemplate, renderCertificate } from '../src/lib/certificatePdf.js';

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
update public.profiles set display_name = 'Ana Reyes' where id = '${S1}';
update public.profiles set display_name = 'Teacher One' where id = '${T1}';
`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('c', 'Course', true)`));
const mod = (await as(T1, () => q(`insert into public.learning_modules (course_id, title) values ('c', 'M1') returning id`)))[0].id;
const units = [];
for (let p = 0; p < MODULE_PAGE_COUNT; p++) units.push((await as(T1, () => q(`insert into public.learning_units (module_id, title, content, position) values ('${mod}', 'P', 'B', ${p}) returning id`)))[0].id);
await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));
await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('c', '${S1}'), ('c', '${S2}')`));
const template = `insert into public.certificate_templates (course_id, file_path, file_kind, page_width, page_height, fields) values ('c', 'c/design.png', 'png', 842, 595, '${JSON.stringify(DEFAULT_FIELDS)}')`;
const claim = (who) => as(who, () => one(`select public.issue_lms_certificate('c') r`)).then((r) => r.r);

test('only the course owner writes the design; enrolled students may read it', async () => {
  await assert.rejects(as(T2, () => q(template)), /row-level security/);
  await assert.rejects(as(S1, () => q(template)), /row-level security/);
  await assert.rejects(as(T1, () => q(template.replace("'c/design.png'", "'other/design.png'"))), /check/);
  await assert.rejects(claim(S1), /not set up a certificate/, 'no design yet');
  await as(T1, () => q(template));
  assert.equal((await as(S1, () => q(`select * from public.certificate_templates`))).length, 1);
  assert.equal((await as(S3, () => q(`select * from public.certificate_templates`))).length, 0, 'not enrolled');
});

test('a student claims only after reading every page; the certificate gets a unique code and snapshots', async () => {
  await assert.rejects(claim(S1), /Read every page first \(0 of 5 done\)/);
  for (const u of units) await as(S1, () => q(`insert into public.unit_completions (unit_id, user_id) values ('${u}', '${S1}')`));
  const cert = await claim(S1);
  assert.match(cert.code, /^JDK-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal((await claim(S1)).code, cert.code, 'claiming twice returns the same certificate');
  const row = await one(`select * from public.lms_certificates where code = '${cert.code}'`);
  assert.deepEqual([row.student_name, row.course_title, row.instructor_name, row.issued_by], ['Ana Reyes', 'Course', 'Teacher One', S1]);
  assert.ok(row.student_number);
  await assert.rejects(as(S1, () => q(`insert into public.lms_certificates (course_id, user_id, course_title, student_name) values ('c', '${S2}', 'x', 'y')`)), /row-level security/);
  await assert.rejects(as(S1, () => q(`update public.lms_certificates set student_name = 'Someone' where user_id = '${S1}' returning id`)).then((r) => { if (!r.length) throw new Error('no rows'); }), /no rows|row-level security/);
});

test('instructor issues to one or many enrolled students; others are skipped; only for own courses', async () => {
  assert.equal(await as(T1, () => one(`select public.issue_certificates('c', array['${S2}', '${S3}']::uuid[]) n`)).then((r) => r.n), 1, 'S3 is not enrolled');
  await assert.rejects(as(T2, () => q(`select public.issue_certificates('c', array['${S2}']::uuid[])`)), /own courses/);
  const roster = await as(T1, () => q(`select * from public.certificate_roster('c')`));
  assert.deepEqual(roster.map((r) => [r.user_id, r.eligible, Boolean(r.code)]).sort(), [[S1, true, true], [S2, false, true]].sort());
  await assert.rejects(as(T2, () => q(`select * from public.certificate_roster('c')`)), /own courses/);
});

test('revoking keeps the record; verification shows valid, revoked or not found to anyone', async () => {
  const c1 = await one(`select id, code from public.lms_certificates where user_id = '${S1}'`);
  const ok = (await as(null, () => one(`select public.verify_certificate(' ${c1.code.toLowerCase()} ') r`))).r;
  assert.deepEqual([ok.found, ok.valid, ok.student_name, ok.course_title], [true, true, 'Ana Reyes', 'Course']);
  await assert.rejects(as(S1, () => q(`select public.revoke_certificate('${c1.id}')`)), /cannot be revoked/);
  await as(T1, () => q(`select public.revoke_certificate('${c1.id}')`));
  const revoked = (await as(null, () => one(`select public.verify_certificate('${c1.code}') r`))).r;
  assert.deepEqual([revoked.found, revoked.valid, Boolean(revoked.revoked_at)], [true, false, true]);
  await assert.rejects(claim(S1), /revoked/, 'the student cannot re-claim a revoked certificate');
  await as(T1, () => q(`select public.issue_certificates('c', array['${S1}']::uuid[])`));
  assert.equal((await one(`select revoked_at from public.lms_certificates where id = '${c1.id}'`)).revoked_at, null, 'issuing again restores it with the same code');
  assert.deepEqual((await as(null, () => one(`select public.verify_certificate('JDK-0000-0000-0000') r`))).r, { found: false, valid: false });
  assert.equal((await as(null, () => q(`select * from public.lms_certificates`))).length, 0, 'signed-out visitors only get the verify answer');
});

test('storage: the owner uploads designs; only holders of a valid certificate (and the owner) can read them', async () => {
  await as(T1, () => q(`insert into storage.objects (name, bucket_id) values ('c/design.png', 'certificate-templates')`));
  await assert.rejects(as(T2, () => q(`insert into storage.objects (name, bucket_id) values ('c/x.png', 'certificate-templates')`)), /row-level security/);
  const read = (who) => as(who, () => q(`select name from storage.objects where bucket_id = 'certificate-templates'`));
  assert.equal((await read(T1)).length, 1);
  assert.equal((await read(S1)).length, 1, 'S1 holds a certificate');
  assert.equal((await read(S3)).length, 0);
  const bucket = await one(`select file_size_limit, allowed_mime_types, public from storage.buckets where id = 'certificate-templates'`);
  assert.equal(Number(bucket.file_size_limit), MAX_TEMPLATE_BYTES);
  assert.deepEqual([...bucket.allowed_mime_types].sort(), Object.keys(TEMPLATE_TYPES).sort());
  assert.equal(bucket.public, false);
});

test('field rules, text that the PDF fonts can print, fitting and alignment', () => {
  assert.equal(fieldsError(DEFAULT_FIELDS), '');
  assert.match(fieldsError(DEFAULT_FIELDS.map((f) => ({ ...f, enabled: false }))), /at least one/);
  assert.match(fieldsError([{ ...DEFAULT_FIELDS[0], x: 1.2 }]), /on the page/);
  assert.match(fieldsError([{ ...DEFAULT_FIELDS[0], color: 'red' }]), /colour/);
  assert.equal(fieldsError([{ ...DEFAULT_FIELDS[0], color: '' }]), '', 'empty colour = the print-ink token');
  assert.equal(withAllFields([{ ...DEFAULT_FIELDS[0], size: 50 }]).length, DEFAULT_FIELDS.length);
  assert.equal(withAllFields([{ ...DEFAULT_FIELDS[0], size: 50 }])[0].size, 50);
  assert.equal(pdfSafeText('José Peña Müller'), 'José Peña Müller', 'Spanish and Filipino accents are kept');
  assert.equal(pdfSafeText('Nguyễn Văn Ả'), 'Nguyen Van A');
  assert.equal(pdfSafeText('名前 – “ok”'), '?? – “ok”');
  assert.equal(fitSize((s) => s * 10, 36, 720), 36);
  assert.equal(fitSize((s) => s * 10, 36, 180), 18);
  assert.deepEqual([anchorX(0.5, 800, 100, 'center'), anchorX(0.5, 800, 100, 'right'), anchorX(0.1, 800, 100, 'left')], [350, 300, 80]);
  assert.deepEqual(imagePageSize(2000, 1414), { width: 842, height: 595 });
  assert.match(templateFileError({ type: 'image/webp', size: 10 }), /PDF, PNG or JPEG/);
  assert.match(templateFileError({ type: 'image/png', size: MAX_TEMPLATE_BYTES + 1 }), /10 MB/);
  const text = certificateText({ student_name: 'A', course_title: 'C', issued_at: '2026-11-14T08:00:00Z', code: 'JDK-1A2B-3C4D-5E6F' }, 'https://x.dev/');
  assert.equal(text.verify_url, 'https://x.dev/verify/JDK-1A2B-3C4D-5E6F');
  assert.equal(text.issued_on, 'November 14, 2026');
  assert.equal(verifyUrl('https://x.dev', 'JDK-1'), 'https://x.dev/verify/JDK-1');
});

test('a real PDF: a PDF design keeps its page and gets the text drawn on it', async () => {
  const design = await PDFDocument.create();
  design.addPage([842, 595]);
  const bytes = await design.save();
  assert.deepEqual(await measureTemplate(bytes, 'pdf'), { width: 842, height: 595 });
  const out = await renderCertificate({ file_kind: 'pdf', page_width: 842, page_height: 595, fields: DEFAULT_FIELDS },
    bytes, certificateText({ student_name: 'José Peña', course_title: 'Digital skills', issued_at: '2026-11-14T00:00:00Z', code: 'JDK-1A2B-3C4D-5E6F' }, 'https://x.dev'), 'Test');
  const doc = await PDFDocument.load(out);
  assert.equal(doc.getPageCount(), 1);
  assert.deepEqual(doc.getPage(0).getSize(), { width: 842, height: 595 });
  assert.equal(doc.getTitle(), 'Test');
  assert.ok(out.length > bytes.length, 'text and fonts were added');
});
