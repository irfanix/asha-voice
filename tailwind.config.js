/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#0F766E',
        danger: '#B4233A',
        watch: '#B45309',
        safe: '#1F7A3F',
        bg: '#F6F7F5',
      },
      fontFamily: {
        sans: [
          'Inter',
          'Noto Sans Telugu',
          'Noto Sans Devanagari',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};