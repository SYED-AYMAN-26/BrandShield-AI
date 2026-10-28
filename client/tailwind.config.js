/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff', 100: '#dbe7ff', 200: '#bcd2ff', 300: '#8fb4ff',
          400: '#5b8bfa', 500: '#3a68f0', 600: '#2a4ddc', 700: '#243fb2',
          800: '#23388c', 900: '#22326f',
        },
      },
      fontFamily: { sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(16,24,40,.06), 0 1px 3px rgba(16,24,40,.10)' },
    },
  },
  plugins: [],
};
