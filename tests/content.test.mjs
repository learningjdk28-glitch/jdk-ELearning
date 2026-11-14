import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ContentError, parseActivity, parseAssessment, parseCourse, parseGlossary, parseLesson, plainText } from '../src/lib/contentParse.js';
import { courseProfile, latestForModule, moduleSummary, reviewSuggestion, strengthsGaps, attemptsForModule } from '../src/lib/modules.js';
import { gradeResponses } from '../src/lib/scoring.js';
import { GLOSSARY } from '../src/data/glossary.js';
import { parseBlocks } from '../src/lib/markdownBlocks.js';

const DIR = new URL('../src/content/networking-basics/', import.meta.url);
const read = (p) => readFileSync(new URL(p, DIR), 'utf8');
const course = parseCourse(read('course.json'));
const mods = course.modules.map((m) => ({
  m,
  lesson: parseLesson(read(`${m.folder}/lesson.md`), m.id),
  assessment: parseAssessment(read(`${m.folder}/assessment.json`), m.id),
  activity: parseActivity(read(`${m.folder}/activity.json`), m.id),
}));

test('course has exactly four modules with the required topics', () => {
  assert.equal(course.modules.length, 4);
  assert.deepEqual(course.modules.map((m) => m.id), ['nb-m1', 'nb-m2', 'nb-m3', 'nb-m4']);
});

test('48 unique questions: 12 per module, 3 per competency per module', () => {
  const all = mods.flatMap((x) => x.assessment.questions);
  assert.equal(all.length, 48);
  assert.equal(new Set(all.map((q) => q.id)).size, 48);
  assert.equal(new Set(all.map((q) => q.text)).size, 48, 'no repeated question text');
  for (const { assessment } of mods) {
    assert.equal(assessment.questions.length, 12);
    for (let c = 0; c < 4; c++) assert.equal(assessment.questions.filter((q) => q.competency === c).length, 3);
  }
});

test('answer keys are valid, varied and options are unique within a question', () => {
  const all = mods.flatMap((x) => x.assessment.questions);
  for (const q of all) {
    assert.ok(q.correct >= 0 && q.correct < q.options.length);
    assert.equal(new Set(q.options).size, q.options.length, `${q.id} repeats an option`);
    assert.ok(q.explanation.length > 10);
  }
  const positions = [0, 1, 2, 3].map((i) => all.filter((q) => q.correct === i).length);
  assert.ok(positions.every((n) => n >= 6), `correct answers should not cluster: ${positions}`);
  for (const { assessment } of mods) {
    assert.ok(new Set(assessment.questions.map((q) => q.correct)).size >= 3, 'each module varies the answer position');
  }
});

test('every lesson parses with objectives, sections, steps, example and practice', () => {
  for (const { lesson } of mods) {
    assert.ok(lesson.title && lesson.objectives.length >= 3 && lesson.sections.length >= 2);
    assert.ok(lesson.steps.length >= 4 && lesson.example && lesson.practice);
  }
});

test('lesson terms all exist in the (merged) glossary and networking terms are complete', () => {
  for (const { lesson } of mods) for (const t of lesson.terms) assert.ok(GLOSSARY[t], `glossary missing ${t}`);
  const extra = parseGlossary(read('glossary.json'));
  assert.ok(Object.keys(extra).length >= 10);
  for (const k of Object.keys(extra)) assert.deepEqual(GLOSSARY[k], extra[k]);
});

test('every module has a valid hands-on activity', () => {
  assert.deepEqual(mods.map((x) => x.activity.type), ['sort', 'sort', 'order', 'spot']);
});

test('malformed content fails with a readable ContentError', () => {
  assert.throws(() => parseCourse('{ not json'), ContentError);
  assert.throws(() => parseAssessment(JSON.stringify({ version: 1, moduleId: 'nb-m1', questions: [] }), 'nb-m1'), /questions|too_small|ContentError|assessment/);
  const good = JSON.parse(read('module-01/assessment.json'));
  const dup = { ...good, questions: good.questions.map((q, i) => (i === 1 ? { ...q, id: good.questions[0].id } : q)) };
  assert.throws(() => parseAssessment(JSON.stringify(dup), 'nb-m1'), /duplicate/);
  const skew = { ...good, questions: good.questions.map((q, i) => (i === 0 ? { ...q, competency: 1 } : q)) };
  assert.throws(() => parseAssessment(JSON.stringify(skew), 'nb-m1'), /competency/);
  const badKey = { ...good, questions: good.questions.map((q, i) => (i === 0 ? { ...q, correct: 9 } : q)) };
  assert.throws(() => parseAssessment(JSON.stringify(badKey), 'nb-m1'), /correct/);
  assert.throws(() => parseAssessment(JSON.stringify(good), 'nb-m2'), /moduleId/);
  assert.throws(() => parseLesson('no front matter here', 'nb-m1'), /front matter/);
  assert.throws(() => parseActivity(JSON.stringify({ type: 'sort', title: 'x', prompt: 'y', groups: ['a', 'b'], items: [{ id: '1', label: 'z', group: 'q' }, { id: '2', label: 'z', group: 'a' }, { id: '3', label: 'z', group: 'a' }, { id: '4', label: 'z', group: 'a' }] }), 'nb-m1'), /unknown group/);
});

test('markdown subset never produces HTML: tags stay plain text', () => {
  const blocks = parseBlocks('Hello <script>alert(1)</script> world\n\n- one\n- two\n\n### Title');
  assert.equal(blocks[0].type, 'p');
  assert.ok(blocks[0].text.includes('<script>'), 'raw text is kept as text, to be rendered by React as a string');
  assert.deepEqual(blocks[1], { type: 'ul', items: ['one', 'two'] });
  assert.equal(blocks[2].type, 'h3');
  assert.equal(plainText('**bold** and `code`'), 'bold and code');
});

// ---------- scoring ----------
const { assessment } = mods[0];
const attemptWith = (rightPerComp, { skip = [] } = {}, createdAt = '2026-01-01T00:00:00Z', id = 'a1') => {
  const used = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const selected = {};
  for (const q of assessment.questions) {
    if (skip.includes(q.id)) continue;
    selected[q.id] = used[q.competency]++ < rightPerComp[q.competency] ? q.correct : (q.correct + 1) % q.options.length;
  }
  return { id, kind: 'module', lessonId: 'nb-m1', createdAt, responses: gradeResponses(assessment.questions, selected) };
};

test('score boundaries 0/3, 1/3, 2/3, 3/3 per competency and total out of 12', () => {
  const a = attemptWith({ 0: 3, 1: 2, 2: 1, 3: 0 });
  const s = moduleSummary(a.responses);
  assert.deepEqual(s.byCompetency.map((c) => c.correct), [3, 2, 1, 0]);
  assert.deepEqual(s.byCompetency.map((c) => c.percent), [100, 67, 33, 0]);
  assert.deepEqual(s.byCompetency.map((c) => c.label), ['Strong performance on this short quiz', 'Developing', 'Needs practice', 'Needs foundational support']);
  assert.equal(s.correct, 6);
  assert.equal(s.outOf, 12);
});

test('total always equals the sum of the four competency counts', () => {
  for (const combo of [[0, 0, 0, 0], [3, 3, 3, 3], [1, 2, 3, 0], [2, 2, 2, 2]]) {
    const s = moduleSummary(attemptWith(combo).responses);
    assert.equal(s.correct, combo.reduce((n, x) => n + x, 0));
    assert.equal(s.correct, s.byCompetency.reduce((n, c) => n + c.correct, 0));
  }
});

test('unanswered questions earn no credit and an empty area is Not assessed', () => {
  const comp3 = assessment.questions.filter((q) => q.competency === 3).map((q) => q.id);
  const s = moduleSummary(attemptWith({ 0: 3, 1: 3, 2: 3, 3: 3 }, { skip: comp3 }).responses);
  assert.equal(s.byCompetency[3].label, 'Not assessed');
  assert.equal(s.byCompetency[3].percent, null);
  assert.equal(s.correct, 9);
  assert.equal(s.outOf, 12);
  const one = moduleSummary(attemptWith({ 0: 3, 1: 3, 2: 3, 3: 3 }, { skip: [comp3[0], comp3[1]] }).responses);
  assert.equal(one.byCompetency[3].correct, 1);
  assert.equal(one.byCompetency[3].outOf, 3, 'still out of 3: skipped questions do not shrink the denominator');
});

test('ties for strongest and weakest list every tied area', () => {
  const g = strengthsGaps(moduleSummary(attemptWith({ 0: 3, 1: 3, 2: 1, 3: 1 }).responses).byCompetency);
  assert.deepEqual(g.strongest.map((c) => c.competency), [0, 1]);
  assert.deepEqual(g.weakest.map((c) => c.competency), [2, 3]);
  const level = strengthsGaps(moduleSummary(attemptWith({ 0: 2, 1: 2, 2: 2, 3: 2 }).responses).byCompetency);
  assert.equal(level.allTied, true);
  assert.deepEqual(level.weakest, []);
});

test('suggestions follow the weakest area and never claim mastery', () => {
  const r = reviewSuggestion(moduleSummary(attemptWith({ 0: 3, 1: 3, 2: 0, 3: 3 }).responses));
  assert.equal(r.kind, 'review');
  assert.deepEqual(r.areas, ['Practical Application']);
  assert.ok(!/mastery|mastered/i.test(r.text.replace(/not a test of mastery/i, '')));
  const perfect = reviewSuggestion(moduleSummary(attemptWith({ 0: 3, 1: 3, 2: 3, 3: 3 }).responses));
  assert.equal(perfect.kind, 'advance');
  const none = reviewSuggestion(moduleSummary(attemptWith({ 0: 0, 1: 0, 2: 0, 3: 0 }, { skip: assessment.questions.map((q) => q.id) }).responses));
  assert.equal(none.kind, 'none');
});

test('retakes keep every attempt; latest is the most recent; profile uses the latest per module', () => {
  const first = attemptWith({ 0: 0, 1: 0, 2: 0, 3: 0 }, {}, '2026-01-01T00:00:00Z', 'first');
  const second = attemptWith({ 0: 3, 1: 3, 2: 3, 3: 3 }, {}, '2026-01-02T00:00:00Z', 'second');
  const other = { ...attemptWith({ 0: 1, 1: 1, 2: 1, 3: 1 }, {}, '2026-01-03T00:00:00Z', 'x'), lessonId: 'nb-m2' };
  const diag = { id: 'd', kind: 'diagnostic', lessonId: null, createdAt: '2026-01-04T00:00:00Z', responses: [] };
  const all = [second, first, other, diag];
  assert.deepEqual(attemptsForModule(all, 'nb-m1').map((a) => a.id), ['first', 'second']);
  assert.equal(latestForModule(all, 'nb-m1').id, 'second');
  const p = courseProfile(all, ['nb-m1', 'nb-m2', 'nb-m3', 'nb-m4']);
  assert.deepEqual(p.map((c) => c.correct), [4, 4, 4, 4], 'module 1 latest (3 each) + module 2 latest (1 each)');
  assert.deepEqual(p.map((c) => c.outOf), [6, 6, 6, 6]);
  assert.equal(attemptsForModule([diag], 'nb-m1').length, 0, 'diagnostic attempts are not module attempts');
});

test('every glossary term sits in exactly one display category', async () => {
  const { GLOSSARY_CATEGORIES, GLOSSARY_TERMS } = await import('../src/data/glossary.js');
  const listed = GLOSSARY_CATEGORIES.flatMap((c) => c.terms);
  assert.equal(new Set(listed).size, listed.length, 'no term is listed twice');
  assert.deepEqual([...listed].sort(), [...GLOSSARY_TERMS].sort());
});
