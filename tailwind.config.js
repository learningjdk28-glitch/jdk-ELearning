// Every colour in the app comes from a semantic token defined once in src/index.css (:root).
// Values are "R G B" channels so opacity modifiers work: bg-brand/10, border-danger/30.
// Never add raw palette colours here or in screens; add a semantic token instead
// (tests/colors.test.mjs fails the build on raw colours outside its shrink-only allowlist).
const token = (name) => `rgb(var(--color-${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: token('surface'), raised: token('surface-raised'), muted: token('surface-muted'), inverse: token('surface-inverse') },
        text: { DEFAULT: token('text'), muted: token('text-muted'), inverse: token('text-inverse'), 'inverse-muted': token('text-inverse-muted') },
        border: { DEFAULT: token('border') },
        brand: { DEFAULT: token('brand'), strong: token('brand-strong'), contrast: token('brand-contrast'), soft: token('brand-soft') },
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        overlay: token('overlay'),
        illo: { 'ink': token('illo-ink'), 'paper': token('illo-paper'), 'sun': token('illo-sun'), '1': token('illo-1'), '1-light': token('illo-1-light'), '1-mid': token('illo-1-mid'), '1-soft': token('illo-1-soft'), '1-tint': token('illo-1-tint'), '2': token('illo-2'), '2-light': token('illo-2-light'), '2-soft': token('illo-2-soft'), '2-tint': token('illo-2-tint'), '3': token('illo-3'), '3-tint': token('illo-3-tint') },
        category: { 1: token('category-1'), 2: token('category-2'), 3: token('category-3'), 4: token('category-4') },
      },
      borderRadius: { '3xl': '1.75rem' },
    },
  },
  plugins: [],
};
