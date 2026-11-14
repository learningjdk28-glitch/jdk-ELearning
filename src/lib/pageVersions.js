// Optional level versions of a page. Pure helpers.
// A page always has its default body. Variants are optional rows; a missing variant falls back to the body.
// A page with no variants shows no level switch at all, so it behaves exactly like a flat page.

const FALLBACK_DEFAULT = { id: 'standard', label: 'Standard', student_label: null, position: 2, is_default: true };

export const defaultLevel = (levels) => levels.find((l) => l.is_default) || FALLBACK_DEFAULT;

/** Levels a student can switch between on this page (default first-in-order). Length 1 = no switch. */
export function availableLevels(unitId, variants, levels) {
  const def = defaultLevel(levels);
  const have = new Set(variants.filter((v) => v.unit_id === unitId).map((v) => v.level_id));
  const list = levels.filter((l) => l.is_default || have.has(l.id));
  if (!list.some((l) => l.id === def.id)) list.push(def);
  return list.sort((a, b) => a.position - b.position);
}

/** The text to show for `levelId`, falling back to the page body when that version does not exist. */
export function pickVersion(unit, variants, levelId, levels) {
  const def = defaultLevel(levels);
  if (levelId && levelId !== def.id) {
    const v = variants.find((x) => x.unit_id === unit.id && x.level_id === levelId);
    if (v) return { content: v.content, levelId };
  }
  return { content: unit.content, levelId: def.id };
}

/** Plain student-facing name of a level: "Simpler explanation", "Standard", "Go deeper". */
export const levelName = (level) => level.student_label || level.label;

/** Steps pages: one "Title | explanation" per line. */
export function parseSteps(content) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [t, ...d] = line.split('|');
      return { t: t.trim(), d: d.join('|').trim() };
    })
    .filter((s) => s.t);
}
