// Certificate rules shared by the design editor, the preview and the PDF. Positions are fractions of the page
// (x across, y down from the top to the text baseline), so they stay right for any template size.

export const MAX_TEMPLATE_BYTES = 10 * 1024 * 1024; // same as the certificate-templates bucket
export const TEMPLATE_TYPES = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpeg' };
/** Image designs become a page whose longer side is this many points (A4 = 842 x 595 pt). */
export const IMAGE_LONG_SIDE_PT = 842;

export const FIELD_DEFS = [
  { key: 'student_name', label: 'Student name' },
  { key: 'course_title', label: 'Course title' },
  { key: 'issued_on', label: 'Date issued' },
  { key: 'code', label: 'Certificate ID' },
  { key: 'verify_url', label: 'Verification link' },
  { key: 'instructor_name', label: 'Instructor name' },
  { key: 'student_number', label: 'Student number' },
];

/** Fonts every PDF reader has (no font files to embed). */
export const FONTS = [
  { id: 'TimesRomanBold', label: 'Serif bold', css: '"Times New Roman", Times, serif', weight: 700, style: 'normal' },
  { id: 'TimesRoman', label: 'Serif', css: '"Times New Roman", Times, serif', weight: 400, style: 'normal' },
  { id: 'TimesRomanItalic', label: 'Serif italic', css: '"Times New Roman", Times, serif', weight: 400, style: 'italic' },
  { id: 'HelveticaBold', label: 'Sans bold', css: 'Helvetica, Arial, sans-serif', weight: 700, style: 'normal' },
  { id: 'Helvetica', label: 'Sans', css: 'Helvetica, Arial, sans-serif', weight: 400, style: 'normal' },
  { id: 'Courier', label: 'Typewriter', css: '"Courier New", Courier, monospace', weight: 400, style: 'normal' },
];

// color '' = the print-ink theme token (see themeInk), so no colour value is written in code.
const field = (key, enabled, y, size, font, extra = {}) => ({ key, enabled, x: 0.5, y, size, font, color: '', align: 'center', maxWidth: 0.8, ...extra });

/** The --color-print-ink token as "#rrggbb" (black where there is no page, e.g. in tests). */
export function themeInk() {
  const v = typeof document !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue('--color-print-ink').trim() : '';
  const channels = (v || '0 0 0').split(/\s+/).map(Number);
  return `#${channels.map((n) => n.toString(16).padStart(2, '0')).join('')}`;
}
export const inkOf = (f) => f.color || themeInk();
export const DEFAULT_FIELDS = [
  field('student_name', true, 0.5, 36, 'TimesRomanBold'),
  field('course_title', true, 0.61, 20, 'Helvetica'),
  field('issued_on', true, 0.72, 14, 'Helvetica'),
  field('instructor_name', false, 0.8, 14, 'TimesRomanItalic'),
  field('student_number', false, 0.85, 11, 'Helvetica'),
  field('code', true, 0.91, 10, 'Courier'),
  field('verify_url', true, 0.95, 9, 'Helvetica'),
];

/** Returns a message, or '' when the field layout can be saved. */
export function fieldsError(fields) {
  if (!Array.isArray(fields) || fields.length === 0 || fields.length > 12) return 'The design needs between 1 and 12 fields.';
  if (!fields.some((f) => f.enabled)) return 'Show at least one field.';
  for (const f of fields) {
    const name = FIELD_DEFS.find((d) => d.key === f.key)?.label;
    if (!name) return 'Unknown field.';
    if (![f.x, f.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 1)) return `${name}: the position must be on the page.`;
    if (!(Number.isFinite(f.size) && f.size >= 6 && f.size <= 120)) return `${name}: the size must be 6 to 120 pt.`;
    if (!FONTS.some((x) => x.id === f.font)) return `${name}: choose a font.`;
    if (f.color && !/^#[0-9a-f]{6}$/i.test(f.color)) return `${name}: choose a colour.`;
    if (!['left', 'center', 'right'].includes(f.align)) return `${name}: choose an alignment.`;
    if (!(Number.isFinite(f.maxWidth) && f.maxWidth >= 0.1 && f.maxWidth <= 1)) return `${name}: the width must be 10% to 100% of the page.`;
  }
  return '';
}

/** Completes a saved layout with any field added since (so old designs keep working). */
export const withAllFields = (fields) => FIELD_DEFS.map((d) => ({ ...(DEFAULT_FIELDS.find((f) => f.key === d.key)), ...((fields || []).find((f) => f.key === d.key) || {}) }));

export const verifyUrl = (origin, code) => `${String(origin || '').replace(/\/+$/, '')}/verify/${code}`;
export const formatIssued = (iso) => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/** What each field prints for one certificate. */
export function certificateText(cert, origin) {
  return {
    student_name: cert.student_name || '',
    course_title: cert.course_title || '',
    issued_on: cert.issued_at ? formatIssued(cert.issued_at) : '',
    code: cert.code || '',
    verify_url: cert.code ? verifyUrl(origin, cert.code) : '',
    instructor_name: cert.instructor_name || '',
    student_number: cert.student_number || '',
  };
}

/** Example values for the live preview. */
export const sampleCertificate = (courseTitle, instructorName) => ({
  student_name: 'Maria Dela Cruz', course_title: courseTitle || 'Course title', issued_at: new Date().toISOString(),
  code: 'JDK-1A2B-3C4D-5E6F', instructor_name: instructorName || 'Instructor name', student_number: 'S-2026-0001',
});

// The standard PDF fonts can only print Windows-1252 characters. Accents are kept where that set has them
// (é, ñ, ü ...); other letters lose their accent; anything else becomes "?".
const CP1252_EXTRA = new Set([...'€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ']);
const printable = (ch) => (ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126) || (ch.charCodeAt(0) >= 160 && ch.charCodeAt(0) <= 255) || CP1252_EXTRA.has(ch);
export function pdfSafeText(text) {
  return [...String(text || '').normalize('NFC')].map((ch) => {
    if (printable(ch)) return ch;
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return base && [...base].every(printable) ? base : '?';
  }).join('');
}

/** Font size after shrinking so the text fits its width. widthAtSize(size) measures the text. */
export function fitSize(widthAtSize, size, maxWidthPt) {
  const w = widthAtSize(size);
  return w <= maxWidthPt || w === 0 ? size : Math.max(6, Math.floor((size * maxWidthPt) / w * 10) / 10);
}

/** Left edge of the text in points for its alignment around x. */
export function anchorX(xFraction, pageWidth, textWidth, align) {
  const x = xFraction * pageWidth;
  return align === 'center' ? x - textWidth / 2 : align === 'right' ? x - textWidth : x;
}

/** Page size in points for an image design, keeping its shape. */
export function imagePageSize(pxWidth, pxHeight) {
  const scale = IMAGE_LONG_SIDE_PT / Math.max(pxWidth, pxHeight);
  return { width: Math.round(pxWidth * scale), height: Math.round(pxHeight * scale) };
}

export function templateFileError(file) {
  if (!file) return 'Choose a file.';
  if (!TEMPLATE_TYPES[file.type]) return 'Use a PDF, PNG or JPEG file (in Canva: Share > Download).';
  if (file.size > MAX_TEMPLATE_BYTES) return 'The file is larger than 10 MB. Export it again at a smaller size.';
  if (file.size === 0) return 'The file is empty.';
  return '';
}

/** A "#rrggbb" colour -> { r, g, b } in 0..1 for the PDF. */
export function hexToRgb01(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 };
}
