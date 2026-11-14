// Multiple-choice question rules shared by the pre-test and quiz editors. The database enforces the same
// limits (2-6 options, correct answer within the options, prompt length).
export const QUESTION_LIMITS = { prompt: 3000, option: 500, explanation: 2000, minOptions: 2, maxOptions: 6 };

export const COMPETENCY_NAMES = ['Foundational knowledge', 'Conceptual understanding', 'Practical application', 'Critical thinking'];
export const DIFFICULTY_NAMES = ['Easy', 'Medium', 'Hard'];

/** Returns an error message, or '' when the question can be saved. */
export function questionError({ prompt, options, correct_index }) {
  if (!prompt?.trim()) return 'Write the question.';
  if (prompt.length > QUESTION_LIMITS.prompt) return `Use ${QUESTION_LIMITS.prompt} characters or fewer for the question.`;
  const filled = (options || []).map((o) => (o || '').trim());
  if (filled.length < QUESTION_LIMITS.minOptions) return `Give at least ${QUESTION_LIMITS.minOptions} answer options.`;
  if (filled.length > QUESTION_LIMITS.maxOptions) return `Use at most ${QUESTION_LIMITS.maxOptions} answer options.`;
  if (filled.some((o) => !o)) return 'Fill in every answer option, or remove the empty ones.';
  if (filled.some((o) => o.length > QUESTION_LIMITS.option)) return `Keep each option under ${QUESTION_LIMITS.option} characters.`;
  if (new Set(filled.map((o) => o.toLowerCase())).size !== filled.length) return 'Two options are the same.';
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= filled.length) return 'Choose the correct answer.';
  return '';
}
