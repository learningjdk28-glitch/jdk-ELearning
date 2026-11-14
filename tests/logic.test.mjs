import test from 'node:test';
import assert from 'node:assert/strict';
import { DIAGNOSTIC_QUESTIONS, LESSON_QUESTIONS } from '../src/data/questions.js';
import { LESSONS } from '../src/data/lessons.js';
import { GLOSSARY } from '../src/data/glossary.js';
import { gradeResponses, competencyStats, levelForScore, diagnosticStats } from '../src/lib/scoring.js';
import { buildPath, recommendNext, selectQuizQuestions } from '../src/lib/adaptive.js';

const attempt = (selectFn, kind = 'diagnostic', createdAt = '2026-01-01T00:00:00Z') => {
  const selected = {};
  for (const q of DIAGNOSTIC_QUESTIONS) selected[q.id] = selectFn(q);
  return { kind, createdAt, responses: gradeResponses(DIAGNOSTIC_QUESTIONS, selected) };
};

test('question bank: 16 diagnostic questions, 4 per competency, valid fields', () => {
  assert.equal(DIAGNOSTIC_QUESTIONS.length, 16);
  for (let c = 0; c < 4; c++) assert.equal(DIAGNOSTIC_QUESTIONS.filter((q) => q.competency === c).length, 4);
  for (const q of [...DIAGNOSTIC_QUESTIONS, ...LESSON_QUESTIONS]) {
    assert.ok(q.id && q.text && q.explanation && q.lesson);
    assert.ok([1, 2, 3].includes(q.difficulty));
    assert.ok(q.options.length >= 3 && q.correct >= 0 && q.correct < q.options.length);
  }
  assert.equal(new Set([...DIAGNOSTIC_QUESTIONS, ...LESSON_QUESTIONS].map((q) => q.id)).size, 16 + LESSON_QUESTIONS.length);
});

test('every lesson has 6 quiz questions and all 3 levels', () => {
  for (const l of LESSONS) {
    assert.equal(LESSON_QUESTIONS.filter((q) => q.lesson === l.id).length, 6);
    for (const lvl of ['foundational', 'standard', 'advanced']) assert.ok(l.levels[lvl].body.length > 0);
  }
});

test('glossary has at least 15 complete entries', () => {
  const entries = Object.values(GLOSSARY);
  assert.ok(entries.length >= 15);
  for (const e of entries) assert.equal(e.length, 3);
});

test('all correct gives 100 in every competency', () => {
  const stats = competencyStats([attempt((q) => q.correct)]);
  assert.deepEqual(stats.map((s) => s.score), [100, 100, 100, 100]);
});

test('all wrong gives 0 and different patterns give different profiles', () => {
  const wrong = competencyStats([attempt((q) => (q.correct + 1) % q.options.length)]);
  assert.deepEqual(wrong.map((s) => s.score), [0, 0, 0, 0]);
  const mixed = competencyStats([attempt((q) => (q.competency === 2 ? (q.correct + 1) % q.options.length : q.correct))]);
  assert.deepEqual(mixed.map((s) => s.score), [100, 100, 0, 100]);
});

test('unanswered questions are excluded and flag insufficient evidence', () => {
  const stats = competencyStats([attempt((q) => (q.competency === 3 ? undefined : q.correct))]);
  assert.equal(stats[3].answered, 0);
  assert.equal(stats[3].score, null);
  assert.equal(stats[3].sufficient, false);
  const partial = competencyStats([attempt((q) => (q.id === 'd01' || q.id === 'd02' ? q.correct : undefined))]);
  assert.equal(partial[0].answered, 2);
  assert.equal(partial[0].sufficient, false);
});

test('score formula: 3 of 4 correct is 75', () => {
  const stats = competencyStats([attempt((q) => (q.id === 'd01' ? (q.correct + 1) % q.options.length : q.correct))]);
  assert.equal(stats[0].score, 75);
});

test('level thresholds', () => {
  assert.equal(levelForScore(49), 'foundational');
  assert.equal(levelForScore(50), 'standard');
  assert.equal(levelForScore(79), 'standard');
  assert.equal(levelForScore(80), 'advanced');
  assert.equal(levelForScore(10, false), 'standard');
  assert.equal(levelForScore(null), 'standard');
});

test('recommendation targets the weakest competency independently', () => {
  for (const weak of [0, 1, 2, 3]) {
    const stats = competencyStats([attempt((q) => (q.competency === weak ? (q.correct + 1) % q.options.length : q.correct))]);
    const next = recommendNext(stats, []);
    assert.equal(next.competency, weak, `weak competency ${weak}`);
    assert.equal(next.level, 'foundational');
    const strongItem = buildPath(stats, []).find((i) => i.competency !== weak);
    assert.equal(strongItem.level, 'advanced');
  }
});

test('completed lessons move to the end of the path', () => {
  const stats = competencyStats([attempt((q) => (q.competency === 3 ? (q.correct + 1) % q.options.length : q.correct))]);
  const path = buildPath(stats, ['phishing']);
  assert.equal(path[path.length - 1].lesson.id, 'phishing');
  assert.notEqual(recommendNext(stats, ['phishing']).lesson.id, 'phishing');
});

test('diagnosticStats uses only the latest diagnostic attempt', () => {
  const old = attempt((q) => (q.correct + 1) % q.options.length, 'diagnostic', '2026-01-01T00:00:00Z');
  const recent = attempt((q) => q.correct, 'diagnostic', '2026-01-02T00:00:00Z');
  assert.deepEqual(diagnosticStats([old, recent]).map((s) => s.score), [100, 100, 100, 100]);
});

test('quiz selection varies with level and returns 3 questions', () => {
  for (const l of LESSONS) {
    const f = selectQuizQuestions(l.id, 'foundational');
    const a = selectQuizQuestions(l.id, 'advanced');
    assert.equal(f.length, 3);
    assert.equal(a.length, 3);
    assert.ok(Math.max(...f.map((q) => q.difficulty)) <= 2);
    assert.ok(a.some((q) => q.difficulty === 3));
  }
});

import { ACTIVITIES, passwordChecks } from '../src/data/activities.js';
import { LEARNING_MODES } from '../src/data/course.js';

test('all four learning modes are available', () => {
  assert.deepEqual(LEARNING_MODES.map((m) => m.status), ['available', 'available', 'available', 'available']);
});

test('every lesson has a valid Kinesthetic activity', () => {
  for (const l of LESSONS) {
    const a = ACTIVITIES[l.id];
    assert.ok(a && a.title && a.prompt, `activity for ${l.id}`);
    if (a.type === 'sort') {
      assert.ok(a.items.length >= 6);
      for (const i of a.items) assert.ok(a.groups.includes(i.group));
    } else if (a.type === 'order') {
      assert.deepEqual([...a.steps].sort(), [...a.answer].sort());
      assert.notDeepEqual(a.steps, a.answer, 'steps must start shuffled');
    } else if (a.type === 'spot') {
      assert.ok(a.segments.some((s) => s.flag) && a.segments.some((s) => !s.flag));
    } else {
      assert.equal(a.type, 'password');
    }
  }
});

test('password checks react to real input', () => {
  assert.ok(passwordChecks('').every((c) => !c.ok));
  assert.ok(passwordChecks('blue-mango-river-42').every((c) => c.ok));
  assert.equal(passwordChecks('password1234').find((c) => c.id === 'common').ok, false);
  assert.equal(passwordChecks('aaaaaaaaaaaa').find((c) => c.id === 'repeat').ok, false);
  assert.equal(passwordChecks('short1!').find((c) => c.id === 'len').ok, false);
});
