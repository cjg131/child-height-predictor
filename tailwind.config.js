/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0f7ff',
          100: '#e0efff',
          500: '#2b6cb0',
          600: '#2356a0',
          700: '#1e467f',
        },
      },
    },
  },
  plugins: [],
};
