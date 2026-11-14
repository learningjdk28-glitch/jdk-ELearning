import { COMPETENCIES } from '../data/course.js';

// Scoring helpers for module assessments (12 questions: 3 per competency).
// Each competency score is correct / questions in that competency (3). Unanswered earns no credit.

export const MODULE_KIND = 'module';

export const FEEDBACK_LABELS = [
  'Needs foundational support',
  'Needs practice',
  'Developing',
  'Strong performance on this short quiz',
];

export function attemptsForModule(attempts, moduleId) {
  return attempts
    .filter((a) => a.kind === MODULE_KIND && a.lessonId === moduleId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function latestForModule(attempts, moduleId) {
  const list = attemptsForModule(attempts, moduleId);
  return list.length ? list[list.length - 1] : null;
}

/** responses: [{ competency, answer, correct }] from one attempt. */
export function moduleSummary(responses) {
  const byCompetency = COMPETENCIES.map((c) => {
    const rows = responses.filter((r) => r.competency === c.id);
    const answered = rows.filter((r) => r.answer !== null && r.answer !== undefined).length;
    const correct = rows.filter((r) => r.correct && r.answer !== null && r.answer !== undefined).length;
    const outOf = rows.length;
    return {
      competency: c.id,
      name: c.name,
      short: c.short,
      correct,
      outOf,
      answered,
      percent: answered === 0 ? null : Math.round((correct / outOf) * 100),
      label: answered === 0 ? 'Not assessed' : FEEDBACK_LABELS[Math.min(3, Math.round((correct / Math.max(outOf, 1)) * 3))],
    };
  });
  return {
    correct: byCompetency.reduce((n, c) => n + c.correct, 0),
    outOf: responses.length,
    answered: byCompetency.reduce((n, c) => n + c.answered, 0),
    byCompetency,
  };
}

/** All tied strongest and weakest areas. Only assessed areas take part. */
export function strengthsGaps(byCompetency) {
  const assessed = byCompetency.filter((c) => c.answered > 0);
  const notAssessed = byCompetency.filter((c) => c.answered === 0);
  if (assessed.length === 0) return { strongest: [], weakest: [], allTied: false, notAssessed };
  const max = Math.max(...assessed.map((c) => c.correct));
  const min = Math.min(...assessed.map((c) => c.correct));
  if (max === min) return { strongest: [], weakest: [], allTied: true, notAssessed };
  return {
    strongest: assessed.filter((c) => c.correct === max),
    weakest: assessed.filter((c) => c.correct === min),
    allTied: false,
    notAssessed,
  };
}

/** Transparent, rules-based suggestion. Not a trained model and not a mastery claim. */
export function reviewSuggestion(summary) {
  const { weakest, allTied, notAssessed } = strengthsGaps(summary.byCompetency);
  if (notAssessed.length > 0 && summary.answered === 0) {
    return { kind: 'none', text: 'No questions were answered, so there is nothing to recommend yet. Retake the quiz to get feedback.' };
  }
  if (allTied) {
    const all3 = summary.byCompetency.every((c) => c.answered > 0 && c.correct === c.outOf);
    if (all3) return { kind: 'advance', text: 'You answered every question correctly. This is a short quiz, so keep practicing, then move on to the next module.' };
    return { kind: 'review', areas: summary.byCompetency.map((c) => c.name), text: `Your scores are level across all areas (${summary.byCompetency[0].correct} of ${summary.byCompetency[0].outOf} each). Re-read the lesson, try the practice activity, then retake the quiz.` };
  }
  const names = weakest.map((c) => c.name);
  return {
    kind: 'review',
    areas: names,
    text: `Lowest on this quiz: ${names.join(' and ')}. Review the lesson and the practice activity, check the glossary terms, then retake the quiz. Three questions per area is a small sample, so treat this as a guide.`,
  };
}

/** Combined view across modules: latest attempt per module, correct and total per competency. */
export function courseProfile(attempts, moduleIds) {
  const latest = moduleIds.map((id) => latestForModule(attempts, id)).filter(Boolean);
  return COMPETENCIES.map((c) => {
    let correct = 0;
    let outOf = 0;
    let answered = 0;
    for (const a of latest) {
      const rows = a.responses.filter((r) => r.competency === c.id);
      outOf += rows.length;
      answered += rows.filter((r) => r.answer !== null && r.answer !== undefined).length;
      correct += rows.filter((r) => r.correct && r.answer !== null && r.answer !== undefined).length;
    }
    return {
      competency: c.id,
      name: c.name,
      short: c.short,
      correct,
      outOf,
      answered,
      score: answered === 0 ? null : Math.round((correct / outOf) * 100),
      sufficient: answered >= 3,
    };
  });
}

/** Snapshot of the questions as the learner saw them, so old reviews stay accurate after content edits. */
export function makeSnapshot(questions) {
  return questions.map((q) => ({
    id: q.id,
    competency: q.competency,
    difficulty: q.difficulty,
    text: q.text,
    options: q.options,
    correct: q.correct,
    explanation: q.explanation,
  }));
}
