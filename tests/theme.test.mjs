// Final phase: light and dark tokens, readable contrast in both, brand colours, and the saved appearance.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BRAND_PRESETS, MIN_TEXT_CONTRAST, SURFACES, brandBase, brandShades, brandValueError, contrast, hexToChannels, resolveMode,
} from '../src/lib/theme.js';

const root = new URL('../', import.meta.url);
const get = (f) => readFileSync(new URL(f, root), 'utf8');
const css = get('src/index.css');

/** Tokens declared inside the block that starts at `opener`. */
function tokens(opener) {
  const start = css.indexOf(opener);
  assert.ok(start >= 0, `missing ${opener}`);
  const body = css.slice(css.indexOf('{', start + opener.length - 1) + 1, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--color-([\w-]+):\s*([\d\s]+);/g)].map((m) => [m[1], m[2].trim()]));
}
const light = tokens(':root {');
const darkMedia = tokens(':root:not([data-theme="light"]) {');
const darkAttr = tokens(':root[data-theme="dark"] {');
const FIXED = (name) => name === 'print-ink' || name.startsWith('illo-');

test('dark mode is defined twice (device setting and chosen dark) and both are identical', () => {
  assert.deepEqual(darkMedia, darkAttr);
  assert.match(css, /@media \(prefers-color-scheme: dark\)/);
});

test('every changeable light token has a dark value; print ink and illustration colours stay fixed', () => {
  const missing = Object.keys(light).filter((k) => !FIXED(k) && !(k in darkAttr));
  assert.deepEqual(missing, []);
  assert.deepEqual(Object.keys(darkAttr).filter(FIXED), [], 'certificates and the welcome art never change with dark mode');
});

const PAIRS = [
  ['text', 'surface'], ['text', 'surface-raised'], ['text', 'surface-muted'],
  ['text-muted', 'surface'], ['text-muted', 'surface-raised'], ['text-muted', 'surface-muted'],
  ['brand', 'surface'], ['brand', 'surface-raised'], ['brand', 'brand-soft'],
  ['brand-contrast', 'brand'], ['brand-contrast', 'brand-strong'],
  ['success', 'surface-raised'], ['warning', 'surface-raised'], ['danger', 'surface-raised'],
  ['text-inverse', 'surface-inverse'], ['text-inverse-muted', 'surface-inverse'],
];
for (const [mode, t] of [['light', light], ['dark', darkAttr]]) {
  test(`contrast check, ${mode} mode: every text and background pair reaches ${MIN_TEXT_CONTRAST}:1`, () => {
    const low = PAIRS.map(([fg, bg]) => [fg, bg, contrast(t[fg], t[bg])]).filter(([, , c]) => c < MIN_TEXT_CONTRAST);
    assert.deepEqual(low.map(([fg, bg, c]) => `${fg} on ${bg}: ${c.toFixed(2)}`), []);
  });
}

test('the theme code and the stylesheet agree on the card surfaces and the default brand', () => {
  assert.equal(SURFACES.light, light['surface-raised']);
  assert.equal(SURFACES.dark, darkAttr['surface-raised']);
  assert.equal(light.brand, BRAND_PRESETS[0].rgb);
  const d = brandShades(BRAND_PRESETS[0].rgb, 'dark');
  assert.deepEqual([darkAttr.brand, darkAttr['brand-strong'], darkAttr['brand-contrast'], darkAttr['brand-soft']], [d.brand, d['brand-strong'], d['brand-contrast'], d['brand-soft']]);
});

test('any brand colour, preset or custom, becomes readable in both modes', () => {
  const colours = [...BRAND_PRESETS.map((p) => p.rgb), hexToChannels('#ffff00'), hexToChannels('#000000'), hexToChannels('#777777'), hexToChannels('#00e5ff'), hexToChannels('#ff0000')];
  for (const base of colours) {
    for (const mode of ['light', 'dark']) {
      const s = brandShades(base, mode);
      assert.ok(contrast(s.brand, SURFACES[mode]) >= MIN_TEXT_CONTRAST, `${base} ${mode}: brand text`);
      assert.ok(contrast(s['brand-contrast'], s.brand) >= MIN_TEXT_CONTRAST, `${base} ${mode}: button text`);
      assert.ok(contrast(s.brand, s['brand-soft']) >= MIN_TEXT_CONTRAST, `${base} ${mode}: brand on its tint`);
    }
  }
});

test('mode, colour codes and saved values', () => {
  assert.deepEqual([resolveMode('system', true), resolveMode('system', false), resolveMode('light', true), resolveMode('dark', false)], ['dark', 'light', 'light', 'dark']);
  assert.equal(hexToChannels('#4F3FD9'), '79 63 217');
  assert.equal(hexToChannels('blue'), null);
  assert.equal(brandBase('teal'), BRAND_PRESETS.find((p) => p.id === 'teal').rgb);
  assert.equal(brandBase(null), null);
  assert.equal(brandValueError('#12ab34'), '');
  assert.match(brandValueError('pink'), /Choose/);
});

test('the database accepts exactly the same appearance values', async () => {
  const sql = get('supabase/migrations/20261123a_theming.sql');
  const ids = /brand_color in \(([^)]+)\)/.exec(sql)[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  assert.deepEqual(ids, BRAND_PRESETS.map((p) => p.id));

  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create schema storage;
    create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    create table storage.buckets (id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), name text, bucket_id text);
    alter table storage.objects enable row level security;
    create publication supabase_realtime;
    grant usage on schema auth, public, storage to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    alter default privileges in schema public grant all on tables to authenticated, anon;
    alter default privileges in schema public grant all on functions to authenticated, anon;`);
  await db.exec(get('supabase_setup.sql'));
  await db.exec(get('supabase_lms_upgrade.sql'));
  for (const f of readdirSync(new URL('supabase/migrations/', root)).filter((x) => x.endsWith('.sql')).sort()) {
    await db.exec(get(`supabase/migrations/${f}`));
    await db.exec(get(`supabase/migrations/${f}`));
  }
  const id = '40000000-0000-4000-8000-000000000004';
  await db.exec(`insert into auth.users (id, email) values ('${id}', 's@t.dev')`);
  assert.equal((await db.query(`select theme, brand_color from public.profiles where id = '${id}'`)).rows[0].theme, 'system');
  for (const ok of ["theme = 'dark', brand_color = 'rose'", "theme = 'light', brand_color = '#12AB34'", "brand_color = null"]) {
    await db.exec(`update public.profiles set ${ok} where id = '${id}'`);
  }
  await assert.rejects(db.exec(`update public.profiles set theme = 'blue' where id = '${id}'`), /theme_check/);
  await assert.rejects(db.exec(`update public.profiles set brand_color = 'pink' where id = '${id}'`), /brand_color_check/);
});
