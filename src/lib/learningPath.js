import { MODULE_PAGE_COUNT } from './courseRules.js';

// Pure learning-path rules. No I/O: the same input always gives the same path, so screens and tests agree.
//
// A module is DONE when all MODULE_PAGE_COUNT pages are read and every published quiz in it is passed.
// Its quiz unlocks after the last page. Course status of each module:
//   done       - finished
//   tested-out - skipped thanks to the pre-test (counts as finished; open any time to review)
//   current    - the first module that is not finished (where "Continue" goes)
//   next       - the module after the current one
//   later      - everything after that (still openable; order is a recommendation, not a lock)
// When the course has a pre-test the student has not taken yet, "Continue" goes to the pre-test first.

/** State of one module. `done` = Set of completed page ids, `passed` = Set of passed quiz ids. */
export function moduleState(module, done, passed) {
  const pages = [...(module.pages || [])].sort((a, b) => a.position - b.position);
  const quizzes = module.quizzes || [];
  const pagesDone = Math.min(pages.filter((p) => done.has(p.id)).length, MODULE_PAGE_COUNT);
  const pagesComplete = pagesDone >= MODULE_PAGE_COUNT;
  const quizzesPassed = quizzes.filter((q) => passed.has(q.id)).length;
  const allPassed = quizzesPassed === quizzes.length;
  const assessment = quizzes.length === 0 ? 'none' : allPassed ? 'passed' : pagesComplete ? 'ready' : 'locked';
  const nextPage = pages.findIndex((p) => !done.has(p.id));
  return {
    pagesDone,
    pagesTotal: MODULE_PAGE_COUNT,
    nextPage, // index of the first unread page, or -1
    assessment,
    nextQuiz: quizzes.find((q) => !passed.has(q.id)) || null,
    complete: pagesComplete && allPassed,
    unitsDone: pagesDone + quizzesPassed,
    units: MODULE_PAGE_COUNT + quizzes.length,
  };
}

/**
 * Path through one course: module states, statuses, overall percent and where "Continue" goes.
 * placement = { testedOut: Set<moduleId>, pretest: 'none' | 'todo' | 'done' } (all optional).
 */
export function coursePath(modules, done, passed, placement = {}) {
  const testedOut = placement.testedOut || new Set();
  const ordered = [...modules].sort((a, b) => a.position - b.position);
  const states = ordered.map((m) => {
    const s = { module: m, ...moduleState(m, done, passed) };
    const skipped = !s.complete && testedOut.has(m.id);
    return { ...s, testedOut: skipped, finishedLike: s.complete || skipped, unitsDone: skipped ? s.units : s.unitsDone };
  });
  const pretestFirst = placement.pretest === 'todo';
  const current = states.findIndex((s) => !s.finishedLike);
  const next = current < 0 ? -1 : states.findIndex((s, i) => i > current && !s.finishedLike);
  // While the pre-test is waiting it is the one "you are here" step; the first module is "up next".
  const status = (s, i) => {
    if (s.complete) return 'done';
    if (s.testedOut) return 'tested-out';
    if (pretestFirst) return i === current ? 'next' : 'later';
    return i === current ? 'current' : i === next ? 'next' : 'later';
  };
  const items = states.map((s, i) => ({ ...s, status: status(s, i) }));
  const units = items.reduce((n, s) => n + s.units, 0);
  const unitsDone = items.reduce((n, s) => n + s.unitsDone, 0);
  const target = current < 0 ? null : items[current];
  return {
    items,
    percent: units ? Math.round((unitsDone / units) * 100) : 0,
    modulesDone: items.filter((s) => s.finishedLike).length,
    finished: items.length > 0 && current < 0,
    pretest: placement.pretest || 'none',
    continue: pretestFirst ? { kind: 'pretest', title: 'Pre-test', moduleId: null, page: null, quizId: null } : target && {
      moduleId: target.module.id,
      title: target.module.title,
      kind: target.nextPage >= 0 ? 'page' : 'quiz',
      page: target.nextPage >= 0 ? target.nextPage : null,
      quizId: target.nextPage >= 0 ? null : target.nextQuiz?.id || null,
    },
  };
}

/** Human description of where a module stands, for screen readers and small labels. */
export function moduleSummary(state) {
  if (state.complete) return 'Done';
  if (state.testedOut) return 'Tested out by your pre-test. Open it any time to review.';
  if (state.assessment === 'ready') return 'Pages done — quiz next';
  if (state.pagesDone === 0) return 'Not started';
  return `Page ${state.pagesDone} of ${state.pagesTotal} read`;
}
