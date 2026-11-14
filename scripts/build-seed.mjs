// Builds supabase/migrations/20261116b_phase2_seed_bundled_courses.sql from the bundled course files,
// so the content is migrated exactly, never retyped. Run: node scripts/build-seed.mjs
//
// Mapping (decided with the product owner):
//   Digital Literacy: each lesson -> one module of MODULE_PAGE_COUNT pages:
//     Overview, Explanation, Step by step, Example, Practice. The STANDARD text is the page body;
//     foundational and advanced texts become optional level variants of pages 2-5.
//   Networking Basics: each module's 6 sections -> 5 pages; the two shortest (Example, Practice) merge.
//   Lesson/module questions -> one module quiz each. Activities -> learning_activities. Glossary -> per course.
//   Pre-test questions (Digital Literacy diagnostic) -> 20261117b_phase4_seed_dl_pretest.sql, each tagged
//   with the module of the lesson it tests. Networking Basics has no pre-test questions.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import { COURSE } from '../src/data/course.js';
import { LESSONS } from '../src/data/lessons.js';
import { DIAGNOSTIC_QUESTIONS, LESSON_QUESTIONS } from '../src/data/questions.js';
import { ACTIVITIES } from '../src/data/activities.js';
import { GLOSSARY, GLOSSARY_CATEGORIES } from '../src/data/glossary.js';
import { parseActivity, parseAssessment, parseCourse, parseLesson } from '../src/lib/contentParse.js';

const NB_DIR = new URL('../src/content/networking-basics/', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, NB_DIR), 'utf8');
const NB = parseCourse(read('course.json'));
const NB_GLOSSARY = JSON.parse(read('glossary.json'));

const uuid = (key) => {
  const h = createHash('md5').update(`jdk-seed:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
};
const q = (s) => `'${String(s).replaceAll("'", "''")}'`;
const json = (v) => `${q(JSON.stringify(v))}::jsonb`;
const steps = (list) => list.map((s) => `${s.t} | ${s.d}`).join('\n');
const paragraphs = (list) => (Array.isArray(list) ? list.join('\n\n') : String(list));
const slug = (term) => term.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const categoryOf = (term) => GLOSSARY_CATEGORIES.find((c) => c.terms.includes(term))?.title || '';

const modules = []; // { id, course, title, description, position, pages: [{title, kind, body, variants:{level:text}}], quiz, activity }

// ---- Digital Literacy ----
LESSONS.forEach((lesson, i) => {
  const lv = lesson.levels;
  const variants = (pick) => ({ foundational: pick(lv.foundational), advanced: pick(lv.advanced) });
  const keyTerms = lesson.terms.map((t) => `- **${t}**: ${GLOSSARY[t]?.[0] || ''}`.trim()).join('\n');
  modules.push({
    id: uuid(`module:${COURSE.id}:${lesson.id}`),
    course: COURSE.id,
    title: lesson.title,
    description: `${lesson.summary}\n\nYou will learn to:\n${lesson.objectives.map((o) => `- ${o}`).join('\n')}`,
    position: i,
    pages: [
      { title: 'Overview', kind: 'article', body: `${lesson.summary}\n\n### Key terms\n${keyTerms}` },
      { title: 'Explanation', kind: 'article', body: paragraphs(lv.standard.body), variants: variants((l) => paragraphs(l.body)) },
      { title: 'Step by step', kind: 'steps', body: steps(lv.standard.steps), variants: variants((l) => steps(l.steps)) },
      { title: 'Example', kind: 'article', body: lv.standard.example, variants: variants((l) => l.example) },
      { title: 'Practice', kind: 'article', body: lv.standard.practice, variants: variants((l) => l.practice) },
    ],
    quiz: {
      title: `${lesson.title}: check your understanding`,
      questions: LESSON_QUESTIONS.filter((x) => x.lesson === lesson.id),
    },
    activity: ACTIVITIES[lesson.id],
  });
});

// ---- Networking Basics ----
NB.modules.forEach((m, i) => {
  const lesson = parseLesson(read(`${m.folder}/lesson.md`), m.id);
  const assessment = parseAssessment(read(`${m.folder}/assessment.json`), m.id);
  const activity = parseActivity(read(`${m.folder}/activity.json`), m.id);
  if (lesson.sections.length !== 3) throw new Error(`${m.id}: expected 3 reading sections, found ${lesson.sections.length}`);
  modules.push({
    id: uuid(`module:${NB.id}:${m.id}`),
    course: NB.id,
    title: lesson.title,
    description: `${m.summary}\n\nYou will learn to:\n${lesson.objectives.map((o) => `- ${o}`).join('\n')}`,
    position: i,
    pages: [
      ...lesson.sections.map((s) => ({ title: s.title, kind: 'article', body: s.body })),
      { title: 'Visual steps', kind: 'steps', body: steps(lesson.steps) },
      { title: 'Example and practice', kind: 'article', body: `### Example\n${lesson.example}\n\n### Practice\n${lesson.practice}` },
    ],
    quiz: { title: `${lesson.title}: module quiz`, questions: assessment.questions || assessment },
    activity,
  });
});

for (const m of modules) {
  if (m.pages.length !== MODULE_PAGE_COUNT) throw new Error(`${m.title}: ${m.pages.length} pages, expected ${MODULE_PAGE_COUNT}`);
  for (const p of m.pages) if (!p.body?.trim()) throw new Error(`${m.title} / ${p.title}: empty page`);
}

// ---- Glossary: each course gets the terms it owns plus the shared ones its lessons use ----
const dlTerms = new Set([...Object.keys(GLOSSARY).filter((t) => !(t in NB_GLOSSARY)), ...LESSONS.flatMap((l) => l.terms)]);
const nbTerms = new Set([...Object.keys(NB_GLOSSARY), ...NB.modules.flatMap((m) => parseLesson(read(`${m.folder}/lesson.md`), m.id).terms)]);
const glossaryRows = [
  ...[...dlTerms].map((t) => [COURSE.id, t]),
  ...[...nbTerms].map((t) => [NB.id, t]),
].filter(([, t]) => GLOSSARY[t]);

// ---- SQL ----
const out = [];
out.push(`-- GENERATED by scripts/build-seed.mjs from the bundled course files. Do not edit by hand.
-- JDK Learn - Phase 2b: seed the two bundled courses into the database as normal, instructor-editable content.
-- Run AFTER 20261116a_phase2_content_model.sql. Runs ONCE (recorded in public.seed_runs): re-running it is a
-- no-op, so it never overwrites or re-creates anything an instructor has edited or deleted.
-- ${modules.length} modules x ${MODULE_PAGE_COUNT} pages, level variants, ${modules.length} quizzes, ${modules.filter((m) => m.activity).length} activities, ${glossaryRows.length} glossary terms.
do $seed$
begin
  if exists (select 1 from public.seed_runs where name = 'phase2-bundled-courses') then
    raise notice 'Bundled courses were already seeded. Nothing to do.';
    return;
  end if;
`);
out.push(`  insert into public.courses (id, title, description, published) values
    (${q(COURSE.id)}, ${q(COURSE.title)}, ${q(COURSE.description)}, true),
    (${q(NB.id)}, ${q(NB.title)}, ${q(NB.description)}, true)
  on conflict (id) do nothing;
`);
for (const m of modules) {
  out.push(`  -- ${m.course} / ${m.title}
  insert into public.learning_modules (id, course_id, title, description, position, published)
  values (${q(m.id)}, ${q(m.course)}, ${q(m.title)}, ${q(m.description)}, ${m.position}, false);`);
  m.pages.forEach((p, i) => {
    const pid = uuid(`page:${m.id}:${i}`);
    out.push(`  insert into public.learning_units (id, module_id, title, kind, content, position, published)
  values (${q(pid)}, ${q(m.id)}, ${q(p.title)}, ${q(p.kind)}, ${q(p.body)}, ${i}, false);`);
    for (const [level, text] of Object.entries(p.variants || {})) {
      if (text?.trim()) out.push(`  insert into public.learning_unit_variants (unit_id, level_id, content) values (${q(pid)}, ${q(level)}, ${q(text)});`);
    }
  });
  const quizId = uuid(`quiz:${m.id}`);
  out.push(`  insert into public.learning_quizzes (id, module_id, title, pass_mark, published) values (${q(quizId)}, ${q(m.id)}, ${q(m.quiz.title)}, 70, true);`);
  m.quiz.questions.forEach((x, i) => {
    out.push(`  insert into public.learning_quiz_questions (id, quiz_id, prompt, options, correct_index, position, competency, difficulty, explanation)
  values (${q(uuid(`question:${quizId}:${x.id}`))}, ${q(quizId)}, ${q(x.text)}, ${json(x.options)}, ${x.correct}, ${i}, ${x.competency ?? 'null'}, ${x.difficulty ?? 'null'}, ${q(x.explanation || '')});`);
  });
  if (m.activity) {
    const { type, title, prompt, ...spec } = m.activity;
    out.push(`  insert into public.learning_activities (id, module_id, kind, title, prompt, spec, position, published)
  values (${q(uuid(`activity:${m.id}`))}, ${q(m.id)}, ${q(type)}, ${q(title)}, ${q(prompt || '')}, ${json(spec)}, 0, true);`);
  }
  out.push(`  update public.learning_modules set published = true where id = ${q(m.id)};\n`);
}
out.push(`  insert into public.glossary_terms (course_id, slug, term, definition, simple, example, category) values
${glossaryRows.map(([c, t]) => `    (${q(c)}, ${q(slug(t))}, ${q(t)}, ${q(GLOSSARY[t][0])}, ${q(GLOSSARY[t][1] || '')}, ${q(GLOSSARY[t][2] || '')}, ${q(categoryOf(t))})`).join(',\n')}
  on conflict (course_id, slug) do nothing;

  insert into public.seed_runs (name) values ('phase2-bundled-courses');
end
$seed$;
`);

const target = new URL('../supabase/migrations/20261116b_phase2_seed_bundled_courses.sql', import.meta.url);
writeFileSync(target, out.join('\n'));
console.log(`seed written: ${modules.length} modules, ${glossaryRows.length} glossary terms`);

// ---- Phase 4: Digital Literacy pre-test ----
const pretest = [`-- GENERATED by scripts/build-seed.mjs from the bundled diagnostic questions. Do not edit by hand.
-- JDK Learn - Phase 4b: Digital Literacy pre-test (${DIAGNOSTIC_QUESTIONS.length} questions, each tagged with the module it tests).
-- Run AFTER 20261117a_phase4_pretest.sql. Runs ONCE (public.seed_runs). Questions for modules an instructor
-- has since deleted are skipped. Turns the course's pre-test on when at least one question was added.
do $seed$
declare added int;
begin
  if exists (select 1 from public.seed_runs where name = 'phase4-dl-pretest') then
    raise notice 'Digital Literacy pre-test was already seeded. Nothing to do.';
    return;
  end if;
  if not exists (select 1 from public.seed_runs where name = 'phase2-bundled-courses') then
    raise exception 'Run 20261116b_phase2_seed_bundled_courses.sql first.';
  end if;
  insert into public.pretest_questions (id, course_id, module_id, prompt, options, correct_index, competency, difficulty, explanation, position)
  select v.id::uuid, ${q(COURSE.id)}, v.module_id::uuid, v.prompt, v.options::jsonb, v.correct, v.competency, v.difficulty, v.explanation, v.position
  from (values
${DIAGNOSTIC_QUESTIONS.map((x, i) => `    (${q(uuid(`pretest:${COURSE.id}:${x.id}`))}, ${q(uuid(`module:${COURSE.id}:${x.lesson}`))}, ${q(x.text)}, ${q(JSON.stringify(x.options))}, ${x.correct}, ${x.competency}, ${x.difficulty}, ${q(x.explanation || '')}, ${i})`).join(',\n')}
  ) as v(id, module_id, prompt, options, correct, competency, difficulty, explanation, position)
  where exists (select 1 from public.learning_modules m where m.id = v.module_id::uuid and m.course_id = ${q(COURSE.id)})
  on conflict (id) do nothing;
  get diagnostics added = row_count;
  if added > 0 then
    update public.courses set pretest_published = true where id = ${q(COURSE.id)};
  end if;
  insert into public.seed_runs (name) values ('phase4-dl-pretest');
  raise notice 'Added % pre-test questions.', added;
end
$seed$;
`];
for (const x of DIAGNOSTIC_QUESTIONS) {
  if (!LESSONS.some((l) => l.id === x.lesson)) throw new Error(`pre-test question ${x.id}: unknown lesson ${x.lesson}`);
}
writeFileSync(new URL('../supabase/migrations/20261117b_phase4_seed_dl_pretest.sql', import.meta.url), pretest.join('\n'));
console.log(`pre-test seed written: ${DIAGNOSTIC_QUESTIONS.length} questions`);
