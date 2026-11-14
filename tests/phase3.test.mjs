// Phase 3: learning path rules and optional page versions (pure logic).
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODULE_PAGE_COUNT } from '../src/lib/courseRules.js';
import { coursePath, moduleState, moduleSummary } from '../src/lib/learningPath.js';
import { availableLevels, levelName, parseSteps, pickVersion } from '../src/lib/pageVersions.js';

const pages = (prefix) => Array.from({ length: MODULE_PAGE_COUNT }, (_, i) => ({ id: `${prefix}${i}`, position: i }));
const mod = (id, position, withQuiz = true) => ({ id, position, title: id, pages: pages(id), quizzes: withQuiz ? [{ id: `${id}-quiz` }] : [] });
const readAll = (m) => m.pages.map((p) => p.id);

test('a fresh module: nothing read, quiz locked, continue at page 1', () => {
  const s = moduleState(mod('a', 0), new Set(), new Set());
  assert.deepEqual([s.pagesDone, s.nextPage, s.assessment, s.complete], [0, 0, 'locked', false]);
  assert.equal(moduleSummary(s), 'Not started');
});

test('the quiz unlocks only after every page is read; done needs the quiz passed', () => {
  const m = mod('a', 0);
  const some = moduleState(m, new Set(readAll(m).slice(0, 2)), new Set());
  assert.equal(some.assessment, 'locked');
  assert.equal(moduleSummary(some), `Page 2 of ${MODULE_PAGE_COUNT} read`);
  const allRead = moduleState(m, new Set(readAll(m)), new Set());
  assert.deepEqual([allRead.assessment, allRead.complete, allRead.nextPage], ['ready', false, -1]);
  const passed = moduleState(m, new Set(readAll(m)), new Set(['a-quiz']));
  assert.equal(passed.complete, true);
});

test('a module without a quiz is done when its pages are read', () => {
  const m = mod('b', 0, false);
  assert.equal(moduleState(m, new Set(readAll(m)), new Set()).complete, true);
});

test('course path: done, current, next, later — and Continue points at the first unread page', () => {
  const ms = [mod('m1', 0), mod('m2', 1), mod('m3', 2), mod('m4', 3)];
  const done = new Set([...readAll(ms[0]), ms[1].pages[0].id, ms[1].pages[1].id]);
  const path = coursePath(ms, done, new Set(['m1-quiz']));
  assert.deepEqual(path.items.map((i) => i.status), ['done', 'current', 'next', 'later']);
  assert.deepEqual(path.continue, { moduleId: 'm2', title: 'm2', kind: 'page', page: 2, quizId: null });
  const units = 4 * (MODULE_PAGE_COUNT + 1);
  assert.equal(path.percent, Math.round(((MODULE_PAGE_COUNT + 1) + 2) / units * 100));
});

test('when all pages are read, Continue goes to the quiz', () => {
  const ms = [mod('m1', 0)];
  const path = coursePath(ms, new Set(readAll(ms[0])), new Set());
  assert.deepEqual(path.continue, { moduleId: 'm1', title: 'm1', kind: 'quiz', page: null, quizId: 'm1-quiz' });
});

test('finished course has no Continue and is 100%', () => {
  const ms = [mod('m1', 0), mod('m2', 1, false)];
  const path = coursePath(ms, new Set([...readAll(ms[0]), ...readAll(ms[1])]), new Set(['m1-quiz']));
  assert.deepEqual([path.finished, path.continue, path.percent], [true, null, 100]);
});

test('modules out of order are sorted by position; empty course is 0% and not finished', () => {
  const path = coursePath([mod('m2', 1), mod('m1', 0)], new Set(), new Set());
  assert.deepEqual(path.items.map((i) => i.module.id), ['m1', 'm2']);
  assert.deepEqual([coursePath([], new Set(), new Set()).percent, coursePath([], new Set(), new Set()).finished], [0, false]);
});

const LEVELS = [
  { id: 'foundational', label: 'Foundational', student_label: 'Simpler explanation', position: 1, is_default: false },
  { id: 'standard', label: 'Standard', student_label: null, position: 2, is_default: true },
  { id: 'advanced', label: 'Advanced', student_label: 'Go deeper', position: 3, is_default: false },
];
const unit = { id: 'u1', content: 'Default body' };

test('a page with no versions behaves exactly like a flat page: no switch, body always shown', () => {
  assert.deepEqual(availableLevels('u1', [], LEVELS).map((l) => l.id), ['standard']);
  for (const lv of ['foundational', 'standard', 'advanced', null, 'unknown']) {
    assert.deepEqual(pickVersion(unit, [], lv, LEVELS), { content: 'Default body', levelId: 'standard' });
  }
});

test('missing version falls back to the body; existing versions are offered in level order', () => {
  const variants = [{ unit_id: 'u1', level_id: 'advanced', content: 'Deeper' }, { unit_id: 'other', level_id: 'foundational', content: 'x' }];
  assert.deepEqual(availableLevels('u1', variants, LEVELS).map((l) => l.id), ['standard', 'advanced']);
  assert.deepEqual(pickVersion(unit, variants, 'foundational', LEVELS), { content: 'Default body', levelId: 'standard' });
  assert.deepEqual(pickVersion(unit, variants, 'advanced', LEVELS), { content: 'Deeper', levelId: 'advanced' });
  assert.deepEqual(LEVELS.map(levelName), ['Simpler explanation', 'Standard', 'Go deeper']);
});

test('steps pages parse "Title | explanation" lines and ignore blanks', () => {
  assert.deepEqual(parseSteps('Look | Check it\n\n  Act | Tap | then wait  \n'), [{ t: 'Look', d: 'Check it' }, { t: 'Act', d: 'Tap | then wait' }]);
});
