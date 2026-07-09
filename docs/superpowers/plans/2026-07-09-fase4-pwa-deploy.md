# PWA instalable + deploy en Vercel (Fase 4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Volver MiBanko instalable como PWA (manifest + service worker de app-shell) con ícono on-brand, y dejarla lista para auto-deploy en Vercel desde GitHub.

**Architecture:** `vite-plugin-pwa` (Workbox) precachea el app-shell y hace `navigateFallback` a index.html; sin `runtimeCaching`, Supabase (otro origen) queda network-only (dato siempre fresco). `@vite-pwa/assets-generator` produce el set de íconos desde un SVG on-brand. `vercel.json` da el rewrite SPA. El deploy en sí lo dispara la usuaria conectando el repo (checklist).

**Tech Stack:** Vite 8.1.3 + React 19 + TS. `vite-plugin-pwa` + `@vite-pwa/assets-generator` (dev-deps, build-time). Vercel (hosting).

## Global Constraints

- Costo cero: solo free tier (Vercel, Supabase).
- El bundle **runtime** es el límite; las deps de PWA son build-time / service worker, no entran al bundle de la app.
- Datos: nunca cachear respuestas de Supabase (network-only) para no mostrar un número viejo como exacto.
- Ningún secreto se commitea: las claves Supabase van en env de Vercel, las pone la usuaria.
- Commits: Conventional Commits, **sin** `Co-Authored-By` ni trailers de co-autoría de IA.
- Colores de marca: ink `#09090b`, accent `#10b981`.

## File Structure

- `public/icon.svg` — SVG fuente on-brand (reemplaza el rol del favicon violeta).
- `index.html` — `lang="es"`, theme-color, description (los links de íconos/manifest los inyecta el plugin).
- `vite.config.ts` — agrega `VitePWA(...)` (guardado para no afectar a vitest).
- `vercel.json` — rewrite SPA + header no-cache del SW.
- `docs/deploy-vercel.md` — checklist de deploy para la usuaria.

---

## Task 1: Ícono on-brand + metadatos del index.html

**Files:**
- Create: `public/icon.svg`
- Delete: `public/favicon.svg`
- Modify: `index.html`

**Interfaces:**
- Produces: `public/icon.svg` (fuente para el generador de íconos de Task 2); `index.html` con `lang="es"`, theme-color y description.

- [ ] **Step 1: Crear el SVG on-brand**

Create `public/icon.svg` (fondo ink redondeado + monograma "M" en accent, dentro de la safe-zone maskable):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="112" fill="#09090b"/>
  <path d="M150 352 L150 160 L256 268 L362 160 L362 352"
        fill="none" stroke="#10b981" stroke-width="56"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>
```

- [ ] **Step 2: Borrar el favicon violeta genérico**

```bash
git rm public/favicon.svg
```

- [ ] **Step 3: Actualizar index.html**

Replace `index.html` con (cambia `lang`, agrega theme-color/description, quita el `<link rel="icon">` al favicon borrado — el plugin inyectará los íconos y el manifest):

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#09090b" />
    <meta name="description" content="MiBanko — Saldo Líquido Real Disponible, finanzas personales." />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="MiBanko" />
    <title>MiBanko</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Verificar que la suite sigue verde (aún sin plugin PWA)**

Run: `npx vitest run`
Expected: toda la suite PASS (no se tocó código de app).

- [ ] **Step 5: Commit**

```bash
git add public/icon.svg index.html
git commit -m "feat(pwa): icono on-brand y metadatos del index.html"
```

---

## Task 2: Configurar vite-plugin-pwa + generación de íconos

**Files:**
- Modify: `package.json` (dev-deps)
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `public/icon.svg` (Task 1).
- Produces: al buildear, `dist/sw.js`, `dist/manifest.webmanifest`, y los PNG de íconos (`pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-*.png`, `apple-touch-icon.png`). El plugin inyecta en el HTML los links de manifest e íconos, y registra el SW (`injectRegister: 'auto'`).

- [ ] **Step 1: Instalar las dependencias (build-time)**

```bash
npm i -D vite-plugin-pwa @vite-pwa/assets-generator
```
Expected: instala sin errores. Si hay warning de peer-deps por Vite 8, es aceptable; se valida con el build en el Step 3.

- [ ] **Step 2: Configurar el plugin en vite.config.ts**

Replace `vite.config.ts` con (el plugin PWA se omite bajo vitest para no afectar los tests):

```ts
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
```

- [ ] **Step 3: Buildear y verificar los artefactos PWA**

Run: `npm run build`
Expected: build OK. Verificar los artefactos generados:

```bash
ls dist/sw.js dist/manifest.webmanifest
ls dist/pwa-192x192.png dist/pwa-512x512.png dist/apple-touch-icon*.png dist/maskable-icon*.png
grep -o '"name":"MiBanko"' dist/manifest.webmanifest
grep -o 'manifest.webmanifest' dist/index.html
grep -ci supabase dist/sw.js
```
Expected: `sw.js` y `manifest.webmanifest` existen; existen los PNG (los nombres exactos los define el preset `minimal-2023`: `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`); el manifest contiene `"name":"MiBanko"`; el `index.html` buildeado referencia el manifest; y `grep -ci supabase dist/sw.js` devuelve `0` (el SW no cachea Supabase).

- [ ] **Step 4: Verificar que la suite y el typecheck siguen verdes**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc sin errores; toda la suite PASS (el plugin está omitido bajo VITEST).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vite.config.ts
git commit -m "feat(pwa): configura vite-plugin-pwa (app-shell) y generacion de iconos"
```

---

## Task 3: vercel.json (rewrite SPA + cache del SW)

**Files:**
- Create: `vercel.json`

**Interfaces:**
- Produces: config de Vercel para que los deep-links de react-router resuelvan a index.html y el SW se revalide.

- [ ] **Step 1: Crear vercel.json**

Create `vercel.json`:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "rewrites": [
    { "source": "/((?!.*\\..*).*)", "destination": "/index.html" }
  ],
  "headers": [
    {
      "source": "/sw.js",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=0, must-revalidate" }
      ]
    }
  ]
}
```

Nota: el rewrite excluye rutas con extensión (`.`) para no pisar `sw.js`, `manifest.webmanifest`, ni `/assets/*`; esos se sirven como archivos estáticos. Vercel además chequea el filesystem antes de aplicar rewrites.

- [ ] **Step 2: Validar el JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('vercel.json OK')"`
Expected: `vercel.json OK`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(deploy): vercel.json con rewrite SPA y no-cache del service worker"
```

---

## Task 4: Checklist de deploy + verificación de instalabilidad

**Files:**
- Create: `docs/deploy-vercel.md`

**Interfaces:**
- Consumes: todo lo anterior (build produce el sitio instalable; vercel.json lo sirve bien).
- Produces: guía paso a paso para que la usuaria conecte el repo y verifique la instalación.

- [ ] **Step 1: Escribir el checklist de deploy**

Create `docs/deploy-vercel.md`:

```markdown
# Deploy de MiBanko en Vercel

Auto-deploy desde GitHub (`joolguin/MiBanko`). El asistente no maneja tus claves:
los valores de las env vars los pegás vos desde tu `.env` local.

## Conectar el repo (una sola vez)
1. Entrá a https://vercel.com → **Add New… → Project**.
2. **Import** `joolguin/MiBanko`.
3. Framework preset: **Vite** (lo detecta solo). Build command `npm run build`,
   output `dist` (por defecto).
4. **Environment Variables** (Production + Preview):
   - `VITE_SUPABASE_URL` = (el mismo valor de tu `.env`)
   - `VITE_SUPABASE_PUBLISHABLE_KEY` = (el mismo valor de tu `.env`)
5. **Deploy**. Al terminar, Vercel te da una URL `https://<algo>.vercel.app`.

Desde acá, **cada push a `main` re-deploya solo**.

## Verificar en el navegador (desktop)
1. Abrí la URL de Vercel.
2. DevTools → **Application**:
   - **Manifest**: nombre "MiBanko", íconos, theme `#09090b`, `standalone`.
   - **Service Workers**: registrado y `activated`.
3. Lighthouse → categoría **PWA**: "Installable" sin errores.
4. Network: una request a `*.supabase.co` aparece como red (no "from ServiceWorker").

## Instalar en el Pixel
1. Abrí la URL de Vercel en Chrome del teléfono.
2. Menú ⋮ → **Agregar a pantalla de inicio** (o el banner de instalación).
3. Abrí MiBanko desde el ícono: debe abrir **standalone** (sin barra del navegador),
   con el ícono verde/oscuro y splash con fondo `#09090b`.
4. Con datos: registrar/leer funciona. Sin red: la app abre el shell y muestra los
   estados de carga/error (no números viejos).
```

- [ ] **Step 2: Verificación local de instalabilidad (manual, documentada)**

Run: `npm run build && npm run preview`
Luego, en el navegador sobre la URL de preview:
- DevTools → Application → Manifest válido y Service Worker `activated`.
- Lighthouse (PWA): "Installable" sin errores.

Registrar el resultado (OK / issues) en el reporte de la tarea.

- [ ] **Step 3: Verificación final del repo**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc sin errores; suite PASS; build OK con `dist/sw.js` + `dist/manifest.webmanifest` + íconos.

- [ ] **Step 4: Commit**

```bash
git add docs/deploy-vercel.md
git commit -m "docs(deploy): checklist de deploy en Vercel e instalacion en el Pixel"
```

---

## Verificación final (antes de finishing-a-development-branch)

- [ ] `npm run build` OK; `dist/` contiene `sw.js`, `manifest.webmanifest`, `pwa-192x192.png`, `pwa-512x512.png`, `apple-touch-icon-180x180.png`, `maskable-icon-512x512.png`.
- [ ] `index.html` buildeado referencia el manifest e inyecta el registro del SW.
- [ ] `npx tsc --noEmit` sin errores; `npx vitest run` toda la suite verde.
- [ ] Instalabilidad verificada localmente (manifest + SW + Lighthouse PWA).
- [ ] `vercel.json` válido; `docs/deploy-vercel.md` con el checklist para la usuaria.
- [ ] El favicon violeta genérico fue reemplazado por el ícono on-brand.
