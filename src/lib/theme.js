// Theme rules: light / dark / follow the device, and the brand colour. Colours here are "R G B" channel strings,
// the same format as the tokens in src/index.css. Pure functions, tested in tests/theme.test.mjs.

export const THEME_MODES = [
  { id: 'system', label: 'Same as this device' },
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
];

/** WCAG 2 minimums: body text 4.5:1. */
export const MIN_TEXT_CONTRAST = 4.5;
/** Brand shades aim higher than the minimum so a tint behind brand text (badges, selections) still passes 4.5:1. */
export const BRAND_TARGET_CONTRAST = 5.5;

/** Raised surfaces (cards, inputs) in each mode; brand text must be readable on them. Same as src/index.css. */
export const SURFACES = { light: '255 255 255', dark: '28 28 42' };

/** Brand presets: the default first. A preset is a starting hue; its shades come from brandShades() like a custom colour. */
export const BRAND_PRESETS = [
  { id: 'indigo', label: 'Indigo', rgb: '79 63 217' },
  { id: 'blue', label: 'Blue', rgb: '37 99 235' },
  { id: 'teal', label: 'Teal', rgb: '13 122 104' },
  { id: 'green', label: 'Green', rgb: '22 128 61' },
  { id: 'rose', label: 'Rose', rgb: '190 24 93' },
  { id: 'orange', label: 'Orange', rgb: '194 65 12' },
];

const parse = (rgb) => String(rgb).trim().split(/\s+/).map(Number);
const fmt = (c) => c.map((n) => Math.round(Math.min(255, Math.max(0, n)))).join(' ');

export function luminance(rgb) {
  const [r, g, b] = parse(rgb).map((v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contrast ratio 1..21 between two colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** "#rrggbb" (any case) -> "R G B" channels; null when not a colour. */
export function hexToChannels(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}
export const channelsToHex = (rgb) => `#${parse(rgb).map((n) => n.toString(16).padStart(2, '0')).join('')}`;

function toHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B); const min = Math.min(R, G, B); const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}
function fromHsl([h, s, l]) {
  if (s === 0) return [l, l, l].map((v) => v * 255);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s; const p = 2 * l - q;
  const f = (t) => { let x = t; if (x < 0) x += 1; if (x > 1) x -= 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)].map((v) => v * 255);
}
/** Same hue, lightness moved step by step until the colour reads at BRAND_TARGET_CONTRAST on `surface`. */
function readableOn(rgb, surface, direction) {
  const [h, s, l0] = toHsl(parse(rgb));
  for (let l = l0; l >= 0 && l <= 1; l += direction * 0.01) {
    const c = fmt(fromHsl([h, s, l]));
    if (contrast(c, surface) >= BRAND_TARGET_CONTRAST) return c;
  }
  return direction < 0 ? '0 0 0' : '255 255 255';
}
const mix = (a, b, t) => fmt(parse(a).map((v, i) => v + (parse(b)[i] - v) * t));
const bestText = (bg) => (contrast('255 255 255', bg) >= contrast('17 17 27', bg) ? '255 255 255' : '17 17 27');

/**
 * The brand tokens for one mode from any base colour. The shade is adjusted (darker in light mode, lighter in dark mode)
 * so brand text stays readable on cards, and the text on brand buttons is whichever of white or near-black reads best.
 */
export function brandShades(baseRgb, mode) {
  const surface = SURFACES[mode];
  const brand = readableOn(baseRgb, surface, mode === 'dark' ? 1 : -1);
  const strong = mode === 'dark' ? mix(brand, '255 255 255', 0.18) : mix(brand, '0 0 0', 0.15);
  // The tint behind brand text (badges, selected items): as much colour as possible while brand text still reads on it.
  let soft = surface;
  for (let t = mode === 'dark' ? 0.22 : 0.1; t >= 0.03; t -= 0.01) {
    const c = mix(surface, brand, t);
    if (contrast(brand, c) >= MIN_TEXT_CONTRAST) { soft = c; break; }
  }
  return { brand, 'brand-strong': strong, 'brand-contrast': bestText(brand), 'brand-soft': soft };
}

/** The saved preference ('#rrggbb' or a preset id or null) as channels, or null for the default brand. */
export function brandBase(value) {
  if (!value) return null;
  return BRAND_PRESETS.find((p) => p.id === value)?.rgb || hexToChannels(value);
}

/** Which mode is shown: the saved choice, or the device's when it is 'system'. */
export const resolveMode = (mode, deviceDark) => (mode === 'dark' || (mode !== 'light' && deviceDark) ? 'dark' : 'light');

/** Accepts only what the database accepts: a preset id or '#rrggbb'. */
export const brandValueError = (value) => (!value || BRAND_PRESETS.some((p) => p.id === value) || /^#[0-9a-f]{6}$/i.test(value) ? '' : 'Choose one of the colours or a valid colour code.');
