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
        // Grises de texto que pasan WCAG AA (4.5:1) sobre el fondo #09090b de la
        // app. Los zinc-600/500 de Tailwind dan 2.57 y 4.12 ahí: no alcanzan.
        // #787881 es el mínimo que pasa con el tinte zinc, elegido para conservar
        // la mayor recesividad posible. Ver src/theme/contrast.test.ts.
        faint: '#787881', // 4.55:1 — el nivel más recesivo
        muted: '#8c8c95', // 5.97:1 — texto secundario
      },
    },
  },
  plugins: [],
}
