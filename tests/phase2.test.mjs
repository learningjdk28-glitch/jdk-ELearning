// Phase 2: content model (page count, optional level variants, activities, glossary) and the bundled-course seed.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_PAGE_COUNT, pageError } from '../src/lib/courseRules.js';

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
await db.exec(get('supabase_setup.sql'));
await db.exec(get('supabase_lms_upgrade.sql'));
const migrations = readdirSync(new URL('supabase/migrations/', root)).filter((f) => f.endsWith('.sql')).sort();
for (const f of migrations) {
  await db.exec(get(`supabase/migrations/${f}`));
  await db.exec(get(`supabase/migrations/${f}`)); // every migration must be safe to run twice in a row
}
await db.exec('grant all on all tables in schema public, storage to authenticated, anon');
await db.exec(`
insert into auth.users (id, email) values ('${SUPER}', 'super@t.dev'), ('${T1}', 't1@t.dev'), ('${T2}', 't2@t.dev'), ('${S1}', 's1@t.dev'), ('${S2}', 's2@t.dev');
update public.profiles set role = 'admin', is_super_admin = true where id = '${SUPER}';
update public.profiles set role = 'admin' where id in ('${T1}', '${T2}');
`);
await as(T1, () => q(`insert into public.courses (id, title, published) values ('t1', 'T1 course', true)`));
const mod = (await as(T1, () => q(`insert into public.learning_modules (course_id, title) values ('t1', 'M') returning id`)))[0].id;
const addPage = (i, kind = 'article', content = 'Body') =>
  as(T1, () => q(`insert into public.learning_units (module_id, title, kind, content, position) values ('${mod}', 'P${i}', '${kind}', '${content}', ${i}) returning id`));

test('app and database agree on the number of pages per module', async () => {
  assert.equal((await one('select public.module_page_count() n')).n, MODULE_PAGE_COUNT);
});

test('a module cannot be published until it has exactly MODULE_PAGE_COUNT pages', async () => {
  for (let i = 0; i < MODULE_PAGE_COUNT - 1; i++) await addPage(i);
  await assert.rejects(as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`)),
    new RegExp(`${MODULE_PAGE_COUNT - 1} of ${MODULE_PAGE_COUNT} pages`));
  await addPage(MODULE_PAGE_COUNT - 1, 'steps', 'Look | Check the screen');
  await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));
  const pages = await q(`select published from public.learning_units where module_id = '${mod}'`);
  assert.equal(pages.length, MODULE_PAGE_COUNT);
  assert.ok(pages.every((p) => p.published), 'publishing the module shows its pages');
});

test('a module never holds more than MODULE_PAGE_COUNT pages', async () => {
  await assert.rejects(addPage(99), new RegExp(`exactly ${MODULE_PAGE_COUNT} pages`));
});

test('pages of a published module cannot be removed or hidden until it is unpublished', async () => {
  const page = (await q(`select id from public.learning_units where module_id = '${mod}' order by position limit 1`))[0].id;
  await assert.rejects(as(T1, () => q(`delete from public.learning_units where id = '${page}'`)), /Unpublish it/);
  await assert.rejects(as(T1, () => q(`update public.learning_units set published = false where id = '${page}'`)), /Unpublish it/);
  await as(T1, () => q(`update public.learning_units set title = 'Renamed' where id = '${page}'`)); // editing is fine
  await as(T1, () => q(`update public.learning_modules set published = false where id = '${mod}'`));
  await as(T1, () => q(`delete from public.learning_units where id = '${page}'`));
  await addPage(0);
  await as(T1, () => q(`update public.learning_modules set published = true where id = '${mod}'`));
});

test('level variants are optional extras; the default level is the page itself', async () => {
  const page = (await q(`select id from public.learning_units where module_id = '${mod}' and kind = 'article' limit 1`))[0].id;
  await as(T1, () => q(`insert into public.learning_unit_variants (unit_id, level_id, content) values ('${page}', 'foundational', 'Simpler')`));
  await assert.rejects(as(T1, () => q(`insert into public.learning_unit_variants (unit_id, level_id, content) values ('${page}', 'standard', 'x')`)), /default level/);
  await assert.rejects(as(T1, () => q(`insert into public.learning_unit_variants (unit_id, level_id, content) values ('${page}', 'expert', 'x')`)), /foreign key/);
  const pagesWithout = await one(`select count(*)::int n from public.learning_units u where module_id = '${mod}' and not exists (select 1 from public.learning_unit_variants v where v.unit_id = u.id)`);
  assert.equal(pagesWithout.n, MODULE_PAGE_COUNT - 1, 'pages without variants carry no variant rows at all');
});

test('a new level can be added without a migration (super administrator)', async () => {
  // Since Phase 4 a level also states the pre-test score it starts at (unique per level).
  await as(SUPER, () => q(`insert into public.learning_levels (id, label, student_label, position, min_score) values ('expert', 'Expert', 'Challenge me', 4, 95)`));
  await assert.rejects(as(T1, () => q(`insert into public.learning_levels (id, label, position) values ('x2', 'X', 5)`)), /row-level security/);
  await q(`delete from public.learning_levels where id = 'expert'`);
});

test("only the owner edits pages, variants, glossary and activities; others can't see drafts", async () => {
  await as(T1, () => q(`insert into public.glossary_terms (course_id, slug, term, definition) values ('t1', 'router', 'router', 'Forwards data')`));
  await as(T1, () => q(`insert into public.learning_activities (module_id, kind, title, spec) values ('${mod}', 'sort', 'Sort', '{"groups":["A"],"items":[]}')`));
  await assert.rejects(as(T2, () => q(`insert into public.glossary_terms (course_id, slug, term, definition) values ('t1', 'x', 'x', 'y')`)), /row-level security/);
  assert.equal((await as(T2, () => q(`update public.learning_unit_variants set content = 'hacked' returning unit_id`))).length, 0);
  assert.equal((await as(T2, () => q(`select * from public.learning_activities where module_id = '${mod}'`))).length, 0, 'unpublished activity hidden');
});

test('enrolled students read published content, glossary and variants; others do not', async () => {
  await as(T1, () => q(`update public.learning_activities set published = true where module_id = '${mod}'`));
  await as(T1, () => q(`insert into public.course_enrollments (course_id, user_id) values ('t1', '${S1}')`));
  const read = (who, table) => as(who, () => q(`select 1 from public.${table}`));
  assert.ok((await read(S1, 'glossary_terms')).length >= 1);
  assert.ok((await read(S1, 'learning_unit_variants')).length >= 1);
  assert.ok((await read(S1, 'learning_activities')).length >= 1);
  assert.equal((await as(S2, () => q(`select 1 from public.glossary_terms where course_id = 't1'`))).length, 0);
  assert.equal((await as(S2, () => q(`select 1 from public.learning_unit_variants v join public.learning_units u on u.id = v.unit_id where u.module_id = '${mod}'`))).length, 0);
  await assert.rejects(as(S1, () => q(`insert into public.glossary_terms (course_id, slug, term, definition) values ('t1', 'y', 'y', 'z')`)), /row-level security/);
});

test('seed: both bundled courses arrive complete and published', async () => {
  const mods = await q(`select course_id, count(*)::int n, bool_and(published) pub from public.learning_modules
                        where course_id in ('digital-literacy', 'networking-basics') group by course_id order by course_id`);
  assert.deepEqual(mods, [{ course_id: 'digital-literacy', n: 5, pub: true }, { course_id: 'networking-basics', n: 4, pub: true }]);
  const pages = await q(`select m.id, count(u.id)::int n from public.learning_modules m join public.learning_units u on u.module_id = m.id
                         where m.course_id in ('digital-literacy', 'networking-basics') group by m.id`);
  assert.ok(pages.every((p) => p.n === MODULE_PAGE_COUNT), 'every seeded module has exactly MODULE_PAGE_COUNT pages');
  const variants = await one(`select count(*)::int n, count(distinct level_id)::int levels from public.learning_unit_variants v
                              join public.learning_units u on u.id = v.unit_id join public.learning_modules m on m.id = u.module_id
                              where m.course_id = 'digital-literacy'`);
  assert.deepEqual(variants, { n: 40, levels: 2 }, '5 lessons x 4 pages x (foundational + advanced)');
  assert.equal((await one(`select count(*)::int n from public.learning_unit_variants v join public.learning_units u on u.id = v.unit_id
                           join public.learning_modules m on m.id = u.module_id where m.course_id = 'networking-basics'`)).n, 0, 'Networking pages are flat');
  const quizzes = await q(`select m.course_id, count(qq.id)::int n from public.learning_quizzes z join public.learning_modules m on m.id = z.module_id
                           join public.learning_quiz_questions qq on qq.quiz_id = z.id group by m.course_id order by 1`);
  assert.deepEqual(quizzes, [{ course_id: 'digital-literacy', n: 30 }, { course_id: 'networking-basics', n: 48 }]);
  assert.equal((await one(`select count(*)::int n from public.learning_quiz_questions where competency is null or difficulty is null`)).n, 0);
  assert.equal((await one(`select count(*)::int n from public.learning_activities a join public.learning_modules m on m.id = a.module_id where m.course_id in ('digital-literacy', 'networking-basics')`)).n, 9);
  const terms = await q(`select course_id, count(*)::int n from public.glossary_terms where course_id in ('digital-literacy', 'networking-basics') group by 1 order by 1`);
  assert.ok(terms.length === 2 && terms.every((t) => t.n > 10), JSON.stringify(terms));
});

test('seed: Networking merged the two shortest sections; Digital Literacy kept every level text', async () => {
  const nb = await q(`select u.title from public.learning_units u join public.learning_modules m on m.id = u.module_id
                      where m.course_id = 'networking-basics' and m.position = 0 order by u.position`);
  assert.deepEqual(nb.map((r) => r.title).slice(3), ['Visual steps', 'Example and practice']);
  const merged = await one(`select content from public.learning_units u join public.learning_modules m on m.id = u.module_id
                            where m.course_id = 'networking-basics' and u.title = 'Example and practice' limit 1`);
  assert.match(merged.content, /### Example[\s\S]+### Practice/);
  const { LESSONS } = await import('../src/data/lessons.js');
  const phishing = LESSONS.find((l) => l.id === 'phishing');
  const example = await q(`select u.content body, v.level_id, v.content from public.learning_units u join public.learning_modules m on m.id = u.module_id
                           left join public.learning_unit_variants v on v.unit_id = u.id where m.title = ${`'${phishing.title}'`} and u.title = 'Example' order by v.level_id`);
  assert.equal(example[0].body, phishing.levels.standard.example);
  assert.deepEqual(example.map((r) => [r.level_id, r.content]), [['advanced', phishing.levels.advanced.example], ['foundational', phishing.levels.foundational.example]]);
});

test('seed runs once: re-running never overwrites instructor edits or restores deleted content', async () => {
  const page = (await q(`select u.id from public.learning_units u join public.learning_modules m on m.id = u.module_id where m.course_id = 'digital-literacy' limit 1`))[0].id;
  await q(`update public.learning_units set content = 'Edited by instructor' where id = '${page}'`);
  await q(`delete from public.glossary_terms where course_id = 'networking-basics' and slug = 'router'`);
  await db.exec(get('supabase/migrations/20261116b_phase2_seed_bundled_courses.sql'));
  assert.equal((await one(`select content from public.learning_units where id = '${page}'`)).content, 'Edited by instructor');
  assert.equal((await q(`select 1 from public.glossary_terms where course_id = 'networking-basics' and slug = 'router'`)).length, 0);
});

test('page validation in the editor', () => {
  assert.match(pageError({ title: '', kind: 'article', content: 'x' }), /title/);
  assert.match(pageError({ title: 'Video', kind: 'video', content: 'http://insecure' }), /https/);
  assert.match(pageError({ title: 'Steps', kind: 'steps', content: 'Do this without a bar' }), /Title \| explanation/);
  assert.equal(pageError({ title: 'Steps', kind: 'steps', content: 'Look | Check the screen\nAct | Tap the button' }), '');
});
