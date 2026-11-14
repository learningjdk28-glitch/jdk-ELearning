// Practice activity rules. The database checks the same rules (public.activity_spec_error); a test keeps them in step.

export const ACTIVITY_KINDS = [
  { id: 'sort', label: 'Sort into groups', hint: 'Students put each item into the right group.' },
  { id: 'order', label: 'Put steps in order', hint: 'Students arrange shuffled steps into the right order.' },
  { id: 'spot', label: 'Spot the red flags', hint: 'Students tap the suspicious parts of a message or screen.' },
  { id: 'password', label: 'Password strength check', hint: 'Students type a practice password and see a checklist. Nothing is saved.' },
];

export const ACTIVITY_LIMITS = {
  groups: [2, 6], groupName: 80,
  items: [2, 30], itemLabel: 200,
  steps: [2, 12], stepText: 300,
  segments: [2, 20], segmentText: 500, why: 500,
  title: 160, prompt: 2000,
};

const isText = (v) => typeof v === 'string';
const len = (v) => (isText(v) ? v.trim().length : 0);
const between = (n, [lo, hi]) => n >= lo && n <= hi;
const distinct = (list) => new Set(list).size === list.length;
/** A short random id for a new sort item or spot part. */
export const newPartId = () => Math.random().toString(36).slice(2, 9);
const sameSet = (a, b) => a.every((x) => b.includes(x)) && b.every((x) => a.includes(x));

/** Returns a message, or '' when the activity settings can be saved. */
export function activityError(kind, spec) {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return 'The activity settings are missing.';
  const L = ACTIVITY_LIMITS;
  if (kind === 'password') return '';
  if (kind === 'sort') {
    const { groups, items } = spec;
    if (!Array.isArray(groups) || !between(groups.length, L.groups)) return 'Give 2 to 6 groups.';
    if (groups.some((g) => !isText(g) || !between(len(g), [1, L.groupName]))) return `Name every group (${L.groupName} characters or fewer).`;
    if (!distinct(groups.map((g) => g.trim().toLowerCase()))) return 'Two groups have the same name.';
    if (!Array.isArray(items) || !between(items.length, L.items)) return 'Give 2 to 30 items to sort.';
    if (items.some((i) => !i || typeof i !== 'object' || !i.id || !between(len(i.label), [1, L.itemLabel]))) return `Write every item (${L.itemLabel} characters or fewer).`;
    if (items.some((i) => !groups.includes(i.group))) return 'Put every item in one of the groups.';
    if (!distinct(items.map((i) => String(i.id)))) return 'Every item needs its own id.';
    return '';
  }
  if (kind === 'order') {
    const { steps, answer } = spec;
    if (!Array.isArray(steps) || !between(steps.length, L.steps)) return 'Give 2 to 12 steps.';
    if (steps.some((s) => !isText(s) || !between(len(s), [1, L.stepText]))) return `Write every step (${L.stepText} characters or fewer).`;
    if (!distinct(steps.map((s) => s.trim().toLowerCase()))) return 'Two steps are the same.';
    if (!Array.isArray(answer) || answer.length !== steps.length || !sameSet(answer, steps)) return 'The correct order must use exactly the same steps.';
    return '';
  }
  if (kind === 'spot') {
    const { segments } = spec;
    if (!Array.isArray(segments) || !between(segments.length, L.segments)) return 'Give 2 to 20 parts.';
    if (segments.some((s) => !s || typeof s !== 'object' || !s.id || !between(len(s.text), [1, L.segmentText])
      || typeof s.flag !== 'boolean' || (s.why != null && (!isText(s.why) || s.why.length > L.why)))) {
      return `Write every part (${L.segmentText} characters or fewer) and say whether it is a red flag.`;
    }
    if (!segments.some((s) => s.flag === true)) return 'Mark at least one part as a red flag.';
    if (!distinct(segments.map((s) => String(s.id)))) return 'Every part needs its own id.';
    return '';
  }
  return 'Unknown activity type.';
}

/**
 * Order activities store the right order as `answer` and a shuffled copy as `steps`.
 * The shuffle is deterministic (same steps, same shuffle) and never equals the answer.
 */
export function shuffledSteps(answer) {
  if (answer.length < 2) return [...answer];
  let seed = [...answer.join('|')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rand = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 2 ** 32; };
  const out = [...answer];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  if (out.every((s, i) => s === answer[i])) out.push(out.shift());
  return out;
}

/** Trims text and builds the stored settings for an activity from the editor form. */
export function buildSpec(kind, form) {
  if (kind === 'sort') {
    const groups = form.groups.map((g) => g.trim());
    return { groups, items: form.items.map((i) => ({ id: i.id || newPartId(), label: i.label.trim(), group: (i.group || '').trim() })) };
  }
  if (kind === 'order') {
    const answer = form.steps.map((s) => s.trim());
    return { steps: shuffledSteps(answer), answer };
  }
  if (kind === 'spot') {
    return { segments: form.segments.map((s) => ({ id: s.id || newPartId(), text: s.text.trim(), flag: Boolean(s.flag), why: (s.why || '').trim() })) };
  }
  return {};
}

/** The editor form for a stored activity (order activities are edited in their correct order). */
export function formFromSpec(kind, spec = {}) {
  if (kind === 'sort') return { groups: spec.groups?.length ? [...spec.groups] : ['', ''], items: spec.items?.length ? spec.items.map((i) => ({ ...i })) : [{ id: '', label: '', group: '' }, { id: '', label: '', group: '' }] };
  if (kind === 'order') return { steps: spec.answer?.length ? [...spec.answer] : ['', '', ''] };
  if (kind === 'spot') return { segments: spec.segments?.length ? spec.segments.map((s) => ({ ...s })) : [{ id: '', text: '', flag: true, why: '' }, { id: '', text: '', flag: false, why: '' }] };
  return {};
}

/** Rules shown by the password activity. Pure function so it can be tested. */
export function passwordChecks(password) {
  const words = password.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3);
  const common = /^(password|123456|qwerty|letmein|welcome|iloveyou|admin|abc123)/i;
  return [
    { id: 'len', label: 'At least 12 characters', ok: password.length >= 12 },
    { id: 'mix', label: 'Mixes letters with numbers or symbols, or is a phrase of 4 or more words', ok: (/[a-z]/i.test(password) && /[0-9]/.test(password) && /[^a-z0-9]/i.test(password)) || words.length >= 4 },
    { id: 'common', label: 'Does not start with a very common password', ok: password.length > 0 && !common.test(password) },
    { id: 'repeat', label: 'Not just repeated characters', ok: password.length > 0 && !/^(.)\1+$/.test(password) },
  ];
}
