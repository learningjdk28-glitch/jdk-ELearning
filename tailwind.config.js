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
        brand: { DEFAULT: token('brand'), strong: token('brand-strong'), contrast: token('brand-contrast'), soft: token('brand-soft'),
          // Legacy alias for screens not yet converted (allowlisted). Do not use in new code.
          dark: token('brand-strong') },
        success: token('success'),
        warning: token('warning'),
        danger: token('danger'),
        overlay: token('overlay'),
        category: { 1: token('category-1'), 2: token('category-2'), 3: token('category-3'), 4: token('category-4') },
        // Legacy alias for screens not yet converted (allowlisted). Do not use in new code.
        navy: token('text'),
      },
      borderRadius: { '3xl': '1.75rem' },
    },
  },
  plugins: [],
};
