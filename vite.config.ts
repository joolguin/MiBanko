/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// El plugin PWA solo corre en dev/build; se omite bajo vitest (VITEST=1) para
// no interferir con el entorno de tests.
const pwaPlugins = process.env.VITEST
  ? []
  : [
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        pwaAssets: {
          image: 'public/icon.svg',
          preset: 'minimal-2023',
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          navigateFallback: 'index.html',
          cleanupOutdatedCaches: true,
        },
        manifest: {
          name: 'MiBanko',
          short_name: 'MiBanko',
          description: 'Saldo Líquido Real Disponible — finanzas personales',
          lang: 'es',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          theme_color: '#09090b',
          background_color: '#09090b',
        },
      }),
    ]

export default defineConfig({
  plugins: [react(), ...pwaPlugins],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})
