export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1b1a3d',
        brand: { DEFAULT: '#4f3fd9', dark: '#4333c0', soft: '#ece9fd' },
        surface: '#f6f5ff',
      },
      borderRadius: { '3xl': '1.75rem' },
    },
  },
  plugins: [],
};
