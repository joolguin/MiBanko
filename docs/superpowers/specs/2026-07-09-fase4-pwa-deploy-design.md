# Fase 4 — PWA instalable + deploy en Vercel (diseño)

**Fecha:** 2026-07-09 · **Rama:** `feat/fase4-pwa-deploy` · **Estado:** aprobado

## 1. Contexto y objetivo

Última fase del plan maestro. La app funciona local pero no está instalada ni desplegada.
Fase 4 la vuelve **instalable en el Pixel** (PWA) y la **despliega en Vercel** con auto-deploy
desde GitHub. Resultado verificable: "App en el teléfono" (plan §10, fila 4).

Estado de partida: no hay `vite-plugin-pwa`, ni manifest, ni service worker, ni `vercel.json`.
Solo `public/favicon.svg` (un logo violeta genérico, off-brand). `vite.config.ts` sin plugin PWA.
`index.html` mínimo con `lang="en"`. El cliente Supabase lee `VITE_SUPABASE_URL` y
`VITE_SUPABASE_PUBLISHABLE_KEY` de env.

## 2. Decisiones de diseño (brainstorming)

| Decisión | Elección | Motivo |
|---|---|---|
| Estrategia de caché del SW | **Solo app-shell; datos siempre de red (network-only)** | Principio "honestidad del dato": nunca mostrar un número viejo como exacto |
| Deploy | **Conectar repo GitHub → Vercel, auto-deploy en push** | Costo cero, sin fricción, CI/CD automático para una usuaria |
| Ícono de la app instalada | **Nuevo, on-brand (ink oscuro + verde accent)** | El favicon actual es violeta genérico, no matchea la identidad |

## 3. Constraints permanentes que aplican

- Costo cero: solo free tier (Vercel, Supabase).
- El bundle **runtime** es el límite (dev-deps de build no cuentan).
- Datos: nunca mostrar información desactualizada como si fuera exacta.
- Commits: Conventional Commits, **sin** `Co-Authored-By` ni trailers de co-autoría de IA.
- Ningún secreto (claves Supabase) se commitea ni lo maneja el asistente; van en env de Vercel.

## 4. Service worker (`vite-plugin-pwa` + Workbox)

- Agregar `vite-plugin-pwa` (dev-dep) al `vite.config.ts` con:
  - `registerType: 'autoUpdate'` — una usuaria, sin prompt de actualización.
  - `workbox.globPatterns` que precachea el app-shell buildeado (`**/*.{js,css,html,svg,png,ico,woff2}`).
  - `workbox.navigateFallback: 'index.html'` — abre offline y sirve las rutas de react-router.
  - **Sin `runtimeCaching`**: Supabase (`*.supabase.co`) es otro origen; al no cachearlo, esas
    requests son network-only y el dato siempre es fresco.
- `registerType: 'autoUpdate'` + `injectRegister: 'auto'` para registrar el SW sin código manual.

## 5. Manifest + `index.html`

Manifest (vía el plugin):
```
name: "MiBanko"
short_name: "MiBanko"
description: "Saldo Líquido Real Disponible — finanzas personales"
lang: "es"
display: "standalone"
orientation: "portrait"
start_url: "/"
scope: "/"
theme_color: "#09090b"
background_color: "#09090b"
icons: [192, 512, 512-maskable]
```

`index.html`:
- `lang="es"` (hoy `"en"`).
- `<meta name="theme-color" content="#09090b">`.
- `<meta name="apple-mobile-web-app-capable" content="yes">` +
  `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`.
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`.
- `<meta name="description" content="...">`.
- El `<link rel="manifest">` lo inyecta el plugin.

## 6. Íconos on-brand

- Crear un SVG fuente propio (`public/` o `assets/`): cuadrado redondeado ink `#09090b` con un
  monograma "M" (MiBanko) en verde accent `#10b981`.
- Generar el set con `@vite-pwa/assets-generator` (dev-dep, **build-time**, no entra al bundle
  runtime): `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png`,
  y un `favicon` actualizado. Reemplaza el favicon violeta.
- El maskable respeta la safe-zone (glifo centrado con padding) para no recortarse en Android.

## 7. Deploy en Vercel (auto-deploy desde GitHub)

- `vercel.json` en la raíz:
  - Rewrite SPA: todas las rutas que no matcheen un archivo estático → `/index.html`
    (para deep-links de react-router como `/historial`).
  - Header para `sw.js`: `Cache-Control: no-cache` (que el navegador revalide el SW; el resto de
    assets llevan hash y se cachean fuerte).
- Pasos manuales de la usuaria (el spec entrega el checklist exacto; el asistente NO maneja claves):
  1. En Vercel, "Add New Project" → importar `joolguin/MiBanko` (framework preset: **Vite**).
  2. Environment Variables: `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` con los valores
     del `.env` local (Production + Preview).
  3. Deploy. Cada push a `main` re-deploya solo.

## 8. Verificación

- **Local:** `npm run build && npm run preview` →
  - DevTools > Application: manifest válido (nombre, íconos, theme), Service Worker registrado y
    activo, `installable`.
  - Lighthouse (categoría PWA / "Installable"): sin errores de instalabilidad.
  - Precache presente; una request a Supabase aparece como network (no served-from-SW).
- **Prod (Pixel):** abrir la URL de Vercel → "Agregar a pantalla de inicio" → la app abre en modo
  standalone, con el ícono correcto y splash con `background_color`; registrar/leer datos funciona
  (online) y offline abre el shell con los estados de error/carga.

## 9. Fuera de alcance (backlog v2)

Offline de datos (caché de respuestas), push notifications, background sync, share target.

## 10. Criterios de aceptación

1. `vite-plugin-pwa` configurado: SW con precache de app-shell, `navigateFallback` a index.html,
   `autoUpdate`, sin runtimeCaching de Supabase.
2. Manifest válido e instalable; `index.html` con `lang="es"`, theme-color y metas apple.
3. Set de íconos on-brand (192/512/maskable/apple-touch) generado; favicon violeta reemplazado.
4. `vercel.json` con rewrite SPA y header no-cache para el SW.
5. `npm run build` OK; el bundle runtime no incorpora dependencias nuevas de la app (las de PWA son
   build-time / SW).
6. Checklist de deploy documentado (import del repo + env vars + deploy).
7. Verificación local de instalabilidad (manifest + SW + Lighthouse) documentada y pasada.
