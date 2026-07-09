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
