import { LESSONS } from '../data/lessons.js';
import { LESSON_QUESTIONS } from '../data/questions.js';
import { COMPETENCIES, LEVEL_LABELS } from '../data/course.js';
import { levelForScore } from './scoring.js';

// Deterministic, rules-based adaptation. This is NOT a trained machine learning model.
// Rules:
//   score < 50           -> foundational level
//   50 <= score < 80     -> standard level
//   score >= 80          -> advanced level
//   fewer than 3 answers -> standard level (insufficient evidence)
// Lesson order: unfinished lessons first, lowest linked competency score first.

export function levelForLesson(lesson, stats) {
  const s = stats[lesson.focus];
  return levelForScore(s.score, s.sufficient);
}

export function buildPath(stats, completedIds = []) {
  const done = new Set(completedIds);
  const hasEvidence = stats.some((s) => s.answered > 0);
  const items = LESSONS.map((lesson, index) => {
    const s = stats[lesson.focus];
    const level = levelForLesson(lesson, stats);
    const completed = done.has(lesson.id);
    const comp = COMPETENCIES[lesson.focus].name;
    let reason;
    if (!hasEvidence) {
      reason = 'Take the pre-test so lessons can match your level.';
    } else if (!s.sufficient) {
      reason = `Not enough ${comp} answers yet (${s.answered}). Standard level is used.`;
    } else {
      reason = `${comp} score is ${s.score}%, so this lesson uses the ${LEVEL_LABELS[level]} level.`;
    }
    return {
      lesson,
      index,
      level,
      completed,
      score: s.score,
      competency: lesson.focus,
      reason,
      sortKey: s.score === null ? 50 : s.score,
    };
  });
  return items.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    return a.index - b.index;
  });
}

export function recommendNext(stats, completedIds = []) {
  return buildPath(stats, completedIds).find((i) => !i.completed) || null;
}

// Number of quiz questions by difficulty for each level.
const QUIZ_PLAN = {
  foundational: { 1: 2, 2: 1, 3: 0 },
  standard: { 1: 1, 2: 2, 3: 0 },
  advanced: { 1: 0, 2: 1, 3: 2 },
};

export function selectQuizQuestions(lessonId, level) {
  const plan = QUIZ_PLAN[level] || QUIZ_PLAN.standard;
  const pool = LESSON_QUESTIONS.filter((q) => q.lesson === lessonId);
  const out = [];
  for (const diff of [1, 2, 3]) {
    out.push(...pool.filter((q) => q.difficulty === diff).slice(0, plan[diff]));
  }
  return out;
}
