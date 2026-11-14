// Colour discipline: every colour in src/ must come from a semantic theme token (src/index.css :root).
// Fails on hex values and raw Tailwind palette classes (bg-white, text-slate-600, border-indigo-100, ...).
//
// tests/color-allowlist.json lists files NOT YET converted. It may only SHRINK:
//   - a file not on the list must be clean
//   - a file on the list that has become clean must be removed from it
//   - the list may never grow beyond BASELINE (the Phase 1 count)
// It must be empty before the theming phase.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const BASELINE = 44;
const root = fileURLToPath(new URL('../', import.meta.url));
const PALETTE = 'white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIX = 'bg|text|border|from|via|to|ring|ring-offset|fill|stroke|outline|divide|shadow|decoration|accent|caret|placeholder';
const RULES = [
  ['hex colour', /#[0-9a-fA-F]{3,8}\b/g],
  ['raw palette class', new RegExp(String.raw`\b(?:${PREFIX})-(?:${PALETTE})(?:-\d{2,3})?(?:\/\d{1,3})?\b`, 'g')],
  ['legacy non-semantic alias', /\b(?:bg|text|border|ring|shadow)-(?:navy|brand-dark)\b/g],
  ['rgb()/hsl() literal', /\b(?:rgba?|hsla?)\(\s*\d/g],
];

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return files(full);
    return /\.(jsx?|css)$/.test(name) ? [full] : [];
  });
}

export function scan() {
  const out = {};
  for (const file of files(join(root, 'src'))) {
    const text = readFileSync(file, 'utf8');
    const hits = RULES.flatMap(([rule, re]) => [...text.matchAll(re)].map((m) => `${rule}: ${m[0]}`));
    if (hits.length) out[relative(root, file).split(sep).join('/')] = hits;
  }
  return out;
}

const allowlist = JSON.parse(readFileSync(join(root, 'tests/color-allowlist.json'), 'utf8'));
const found = scan();

test('files outside the allowlist use theme tokens only', () => {
  const offenders = Object.entries(found).filter(([f]) => !allowlist.includes(f));
  assert.deepEqual(offenders.map(([f, h]) => `${f} -> ${[...new Set(h)].slice(0, 6).join(', ')}`), []);
});

test('allowlist only shrinks: converted files must be removed', () => {
  const clean = allowlist.filter((f) => !found[f]);
  assert.deepEqual(clean, [], 'these files are clean now: remove them from tests/color-allowlist.json');
  assert.ok(allowlist.length <= BASELINE, `allowlist grew to ${allowlist.length} (baseline ${BASELINE}). Convert the file instead.`);
});
