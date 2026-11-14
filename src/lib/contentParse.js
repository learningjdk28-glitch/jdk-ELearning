import { z } from 'zod';

// Pure parsers and validators for file-based course content. No browser or Vite APIs here,
// so they are used by the app loader and by the Node tests alike.

export class ContentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContentError';
  }
}

const text = z.string().trim().min(1);

const courseSchema = z.object({
  id: text,
  title: text,
  description: z.string(),
  version: z.number().int().min(1),
  modules: z
    .array(z.object({ id: text, slug: text, folder: text, title: text, summary: z.string() }))
    .min(1),
});

const questionSchema = z
  .object({
    id: text,
    competency: z.number().int().min(0).max(3),
    difficulty: z.number().int().min(1).max(3),
    text,
    options: z.array(text).min(2).max(6),
    correct: z.number().int().min(0),
    explanation: text,
  })
  .refine((q) => q.correct < q.options.length, { message: 'correct must point at an option' });

export const QUESTIONS_PER_MODULE = 12;
export const QUESTIONS_PER_COMPETENCY = 3;

const assessmentSchema = z
  .object({
    version: z.number().int().min(1),
    moduleId: text,
    questions: z.array(questionSchema).length(QUESTIONS_PER_MODULE),
  })
  .superRefine((a, ctx) => {
    const ids = new Set();
    for (const q of a.questions) {
      if (ids.has(q.id)) ctx.addIssue({ code: 'custom', message: `duplicate question id ${q.id}` });
      ids.add(q.id);
    }
    for (let c = 0; c < 4; c++) {
      const n = a.questions.filter((q) => q.competency === c).length;
      if (n !== QUESTIONS_PER_COMPETENCY) {
        ctx.addIssue({ code: 'custom', message: `competency ${c} has ${n} questions, expected ${QUESTIONS_PER_COMPETENCY}` });
      }
    }
  });

const activitySchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('sort'),
    title: text,
    prompt: text,
    groups: z.array(text).min(2),
    items: z.array(z.object({ id: text, label: text, group: text })).min(4),
  }),
  z.object({
    type: z.literal('order'),
    title: text,
    prompt: text,
    steps: z.array(text).min(3),
    answer: z.array(text).min(3),
  }),
  z.object({
    type: z.literal('spot'),
    title: text,
    prompt: text,
    segments: z.array(z.object({ id: text, text, flag: z.boolean(), why: text })).min(3),
  }),
]);

const glossarySchema = z.record(z.string(), z.tuple([text, text, text]));

function json(raw, label) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new ContentError(`${label} is not valid JSON.`);
  }
}

function check(schema, value, label) {
  const r = schema.safeParse(value);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new ContentError(`${label}: ${i.path.join('.') || 'root'} ${i.message}`);
  }
  return r.data;
}

export function parseCourse(raw) {
  const course = check(courseSchema, json(raw, 'course.json'), 'course.json');
  const ids = new Set(course.modules.map((m) => m.id));
  if (ids.size !== course.modules.length) throw new ContentError('course.json: duplicate module id');
  return course;
}

export function parseAssessment(raw, moduleId) {
  const a = check(assessmentSchema, json(raw, `assessment for ${moduleId}`), `assessment for ${moduleId}`);
  if (a.moduleId !== moduleId) throw new ContentError(`assessment for ${moduleId}: moduleId is ${a.moduleId}`);
  return a;
}

export function parseActivity(raw, moduleId) {
  const a = check(activitySchema, json(raw, `activity for ${moduleId}`), `activity for ${moduleId}`);
  if (a.type === 'sort') {
    for (const i of a.items) if (!a.groups.includes(i.group)) throw new ContentError(`activity for ${moduleId}: item ${i.id} has unknown group`);
  }
  if (a.type === 'order' && [...a.steps].sort().join('|') !== [...a.answer].sort().join('|')) {
    throw new ContentError(`activity for ${moduleId}: answer must contain the same steps`);
  }
  return a;
}

export function parseGlossary(raw) {
  return check(glossarySchema, json(raw, 'glossary.json'), 'glossary.json');
}

/**
 * Lesson file format:
 *   ---
 *   title: ...
 *   objectives:
 *   - ...
 *   terms: a, b
 *   ---
 *   ## Section title
 *   markdown subset (paragraphs, - lists, ### headings, **bold**, *italic*, `code`)
 *   ## Visual steps      (list of "Title | description")
 *   ## Example
 *   ## Practice
 */
export function parseLesson(raw, moduleId) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.trim());
  if (!m) throw new ContentError(`lesson for ${moduleId}: missing front matter`);
  const meta = { title: '', objectives: [], terms: [] };
  let listKey = null;
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^(\w+):\s*(.*)$/.exec(line);
    if (kv) {
      listKey = null;
      if (kv[1] === 'title') meta.title = kv[2].trim();
      else if (kv[1] === 'terms') meta.terms = kv[2].split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      else if (kv[1] === 'objectives') listKey = 'objectives';
    } else if (listKey && /^-\s+/.test(line)) {
      meta[listKey].push(line.replace(/^-\s+/, '').trim());
    }
  }
  if (!meta.title) throw new ContentError(`lesson for ${moduleId}: title missing`);
  if (meta.objectives.length === 0) throw new ContentError(`lesson for ${moduleId}: objectives missing`);

  const sections = [];
  let current = null;
  for (const line of m[2].split(/\r?\n/)) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) {
      current = { title: h[1].trim(), lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }
  const body = (s) => s.lines.join('\n').trim();
  const find = (name) => sections.find((s) => s.title.toLowerCase() === name);

  const stepsSection = find('visual steps');
  const steps = stepsSection
    ? body(stepsSection)
        .split('\n')
        .filter((l) => /^-\s+/.test(l))
        .map((l) => {
          const [t, ...d] = l.replace(/^-\s+/, '').split('|');
          return { t: t.trim(), d: d.join('|').trim() };
        })
        .filter((s) => s.t && s.d)
    : [];
  const example = find('example') ? body(find('example')) : '';
  const practice = find('practice') ? body(find('practice')) : '';
  const reading = sections.filter((s) => !['visual steps', 'example', 'practice'].includes(s.title.toLowerCase())).map((s) => ({ title: s.title, body: body(s) }));

  if (reading.length === 0) throw new ContentError(`lesson for ${moduleId}: no lesson sections`);
  if (steps.length < 3) throw new ContentError(`lesson for ${moduleId}: needs at least 3 visual steps`);
  if (!example || !practice) throw new ContentError(`lesson for ${moduleId}: example and practice are required`);
  return { ...meta, sections: reading, steps, example, practice };
}

/** Removes markdown markers so text can be read aloud. */
export function plainText(markdown) {
  return markdown
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^###\s+/gm, '')
    .replace(/^-\s+/gm, '')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
