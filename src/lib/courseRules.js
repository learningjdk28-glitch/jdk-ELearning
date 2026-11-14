// Course structure rules shared by validation, the editors and progress math.
// MODULE_PAGE_COUNT is the ONLY place the app states how many pages a module has.
// The database enforces the same number in public.module_page_count()
// (supabase/migrations/20261116a_phase2_content_model.sql); tests/phase2.test.mjs fails if they differ.
export const MODULE_PAGE_COUNT = 5;

/** Page types an instructor can choose. Only reading and steps pages can have level versions. */
export const PAGE_KINDS = [
  { id: 'article', label: 'Reading', hint: 'Paragraphs, "- " bullet lists, "### " sub-headings and **bold**.', variants: true },
  { id: 'steps', label: 'Steps', hint: 'One step per line: Step title | what to do.', variants: true },
  { id: 'video', label: 'Video link', hint: 'A secure https:// link to a video.', variants: false },
  { id: 'link', label: 'Resource link', hint: 'A secure https:// link to a web page.', variants: false },
];

export const pageKind = (id) => PAGE_KINDS.find((k) => k.id === id) || PAGE_KINDS[0];

/** Progress through a module, as a fraction 0..1 of MODULE_PAGE_COUNT. */
export const moduleProgress = (pagesDone) => Math.min(pagesDone, MODULE_PAGE_COUNT) / MODULE_PAGE_COUNT;

/** Validates a page before saving. Returns an error message or ''. */
export function pageError({ title, kind, content }) {
  if (!title?.trim()) return 'Give the page a title.';
  if (title.trim().length > 160) return 'Use 160 characters or fewer for the title.';
  if (!content?.trim()) return 'Write the page content.';
  if (!pageKind(kind).variants && !/^https:\/\/\S+$/i.test(content.trim())) return 'Links and videos must be a single https:// address.';
  if (kind === 'steps') {
    const bad = content.split('\n').map((l) => l.trim()).filter(Boolean).find((l) => !/^[^|]+\|.+$/.test(l));
    if (bad) return `Each step needs "Title | explanation". Check: "${bad.slice(0, 60)}"`;
  }
  return '';
}
