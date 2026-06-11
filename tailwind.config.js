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
        // Legacy tokens — used by shelved screens only (auth/, (member)/, invite/). Do not use in new code.
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
        app: {
          bg: '#f8f6f0',
          card: '#ffffff',
          border: '#e8e4dc',
        },
        brand: {
          50:  '#EDF2FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          600: '#3B5BDB',
          700: '#2F4AC7',
          800: '#2340B0',
        },
        surface: '#FFFFFF',
        bg: '#F8F9FB',
        border: '#E5E7EB',
        text: {
          primary:   '#1A1D23',
          secondary: '#4B5563',
          tertiary:  '#6B7280',
        },
        recording: '#E53E3E',
      },
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
