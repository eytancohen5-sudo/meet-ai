/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f4f8',
          100: '#d9e2ec',
          400: '#6e8fac',
          700: '#2d5a8e',
          800: '#1e3a5f',
          900: '#112240',
        },
        gold: {
          300: '#e8d5a3',
          400: '#d4b86a',
          500: '#c9a84c',
          600: '#b8943a',
        },
        villa: {
          bg: '#f8f6f0',
          card: '#ffffff',
          border: '#e8e4dc',
        },
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
