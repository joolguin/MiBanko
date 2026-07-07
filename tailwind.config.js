/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist Sans', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: { DEFAULT: '#09090b', 1: '#0c0c0e', 2: '#18181b', line: '#27272a' },
        accent: { DEFAULT: '#10b981', bright: '#34d399', deep: '#04140d' },
        debt: '#dc6a5a',
      },
    },
  },
  plugins: [],
}
