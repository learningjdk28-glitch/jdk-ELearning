import { COMPETENCIES } from '../data/course.js';

// Minimum answered questions before a competency score is treated as reliable.
export const MIN_EVIDENCE = 3;
export const LOW_THRESHOLD = 50;
export const HIGH_THRESHOLD = 80;

/**
 * Convert the learner selections into stored response rows.
 * selected: { [questionId]: optionIndex }
 * Unanswered questions get answer = null and are excluded from scoring.
 */
export function gradeResponses(questions, selected) {
  return questions.map((q) => {
    const answer = Number.isInteger(selected[q.id]) ? selected[q.id] : null;
    return {
      questionId: q.id,
      competency: q.competency,
      difficulty: q.difficulty,
      answer,
      correct: answer === null ? false : answer === q.correct,
    };
  });
}

/**
 * Competency Score = (Correct Answers / Answered Questions) x 100.
 * Only answered questions count. A competency with no answers has score null.
 */
export function competencyStats(attempts) {
  return COMPETENCIES.map((c) => {
    const rows = attempts
      .flatMap((a) => a.responses || [])
      .filter((r) => r.competency === c.id && r.answer !== null && r.answer !== undefined);
    const answered = rows.length;
    const correct = rows.filter((r) => r.correct).length;
    return {
      competency: c.id,
      name: c.name,
      short: c.short,
      answered,
      correct,
      score: answered === 0 ? null : Math.round((correct / answered) * 100),
      sufficient: answered >= MIN_EVIDENCE,
    };
  });
}

export function latestOfKind(attempts, kind) {
  const list = attempts.filter((a) => a.kind === kind);
  return list.length ? list.reduce((a, b) => (a.createdAt >= b.createdAt ? a : b)) : null;
}

/** Score from the latest diagnostic attempt only (the baseline). */
export function diagnosticStats(attempts) {
  const latest = latestOfKind(attempts, 'diagnostic');
  return competencyStats(latest ? [latest] : []);
}

export function levelForScore(score, sufficient = true) {
  if (score === null || score === undefined || !sufficient) return 'standard';
  if (score < LOW_THRESHOLD) return 'foundational';
  if (score >= HIGH_THRESHOLD) return 'advanced';
  return 'standard';
}

export function strengthsAndWeaknesses(stats) {
  const scored = stats.filter((s) => s.score !== null && s.sufficient);
  if (scored.length === 0) return { strengths: [], weaknesses: [], insufficient: stats.filter((s) => !s.sufficient) };
  const strengths = scored.filter((s) => s.score >= HIGH_THRESHOLD);
  const weaknesses = scored.filter((s) => s.score < LOW_THRESHOLD);
  // If nothing crosses a threshold, still name the relative best and weakest.
  if (strengths.length === 0 && weaknesses.length === 0 && scored.length > 1) {
    const sorted = [...scored].sort((a, b) => a.score - b.score);
    const low = sorted[0];
    const high = sorted[sorted.length - 1];
    if (high.score !== low.score) {
      return {
        strengths: [high],
        weaknesses: [low],
        insufficient: stats.filter((s) => !s.sufficient),
        relative: true,
      };
    }
  }
  return { strengths, weaknesses, insufficient: stats.filter((s) => !s.sufficient) };
}
