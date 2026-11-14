// Phase 6b: no bundled course content is left; every screen reads the database.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks } from '../src/lib/markdownBlocks.js';
import { readAloudParts, speakable } from '../src/lib/readAloud.js';
import { glossaryForAnswers, offlineAnswer } from '../src/lib/offlineAnswer.js';

const src = fileURLToPath(new URL('../src/', import.meta.url));
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(jsx?|mjs)$/.test(f)) files.push(p); } };
walk(src);

test('the bundled content folders are gone and nothing reads them', () => {
  assert.equal(existsSync(join(src, 'data')), false);
  assert.equal(existsSync(join(src, 'content')), false);
  const readers = files.filter((f) => /from\s+['"][./]+(data|content)\/|import\.meta\.glob\(\s*['"][^'"]*\/content\//.test(readFileSync(f, 'utf8')));
  assert.deepEqual(readers, []);
});

test('no screen mentions a specific bundled course by name', () => {
  const named = files.filter((f) => /Networking Basics|Digital Literacy/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(named, []);
});

test('Learning mode and the old device store are gone', () => {
  const hits = files.filter((f) => /LearnerContext|learning_mode|navi-learn-v2/.test(readFileSync(f, 'utf8')) && !f.endsWith('main.jsx'));
  assert.deepEqual(hits, []);
});

test('markdown subset never produces HTML: tags stay plain text', () => {
  const blocks = parseBlocks('Hello <script>alert(1)</script> world\n\n- one\n- two\n\n### Title');
  assert.equal(blocks[0].type, 'p');
  assert.ok(blocks[0].text.includes('<script>'), 'raw text is kept as text, to be rendered by React as a string');
  assert.deepEqual(blocks[1], { type: 'ul', items: ['one', 'two'] });
  assert.equal(blocks[2].type, 'h3');
});

test('read aloud: title, then headings, paragraphs, list items and steps, without Markdown marks', () => {
  assert.equal(speakable('A **bold** [link](https://x.dev) here'), 'A bold link here');
  assert.deepEqual(readAloudParts('Wi-Fi', 'article', '### Why\nIt is **useful**.\n\n- one\n- two'), ['Wi-Fi', 'Why', 'It is useful.', 'one', 'two']);
  assert.deepEqual(readAloudParts('Steps', 'steps', 'Open it | the app\nTap Send'), ['Steps', 'Step 1. Open it. the app', 'Step 2. Tap Send']);
  assert.equal(readAloudParts('Clip', 'video', 'https://youtu.be/x').length, 2);
});

test('the offline assistant answers from the database glossary', () => {
  const g = glossaryForAnswers([{ term: 'router', definition: 'Forwards data between networks.', simple: '', example: '' }]);
  assert.match(offlineAnswer('what is a router', g), /Forwards data/);
});
