// Applies the appearance to the page: data-theme on <html> picks the light or dark tokens in src/index.css,
// and a chosen brand colour overrides the four brand tokens with shades that stay readable in the shown mode.
import { brandBase, brandShades, resolveMode } from './theme.js';

const KEY = 'jdk-appearance';
const BRAND_TOKENS = ['brand', 'brand-strong', 'brand-contrast', 'brand-soft'];
let current = { theme: 'system', brand: null };
let media = null;

const deviceDark = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches;
export const shownMode = () => resolveMode(current.theme, deviceDark());
export const currentAppearance = () => current;

function paintBrand() {
  const root = document.documentElement;
  const base = brandBase(current.brand);
  if (!base) { BRAND_TOKENS.forEach((n) => root.style.removeProperty(`--color-${n}`)); return; }
  const shades = brandShades(base, shownMode());
  BRAND_TOKENS.forEach((n) => root.style.setProperty(`--color-${n}`, shades[n]));
}

/** pref: { theme, brand } or null for the defaults. Remembered on this device so the next start shows it at once. */
export function applyAppearance(pref) {
  current = { theme: ['light', 'dark'].includes(pref?.theme) ? pref.theme : 'system', brand: pref?.brand || null };
  const root = document.documentElement;
  if (current.theme === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', current.theme);
  paintBrand();
  window.dispatchEvent(new Event('jdk-appearance'));
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage blocked: applied for this visit only */ }
}

/** Called once at start-up, before the first render: last appearance, and follow device changes. */
export function startAppearance() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { /* none */ }
  applyAppearance(saved);
  if (!media && window.matchMedia) {
    media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener?.('change', () => { paintBrand(); window.dispatchEvent(new Event('jdk-appearance')); });
  }
}
