# Spec de diseño — Fase 1 (Core)

**Proyecto:** MiBanko — Saldo Líquido Real Disponible (SLRD)
**Fecha:** 2026-07-07 · **Estado:** aprobado en brainstorming, pendiente revisión de spec

Este documento cubre solo la **Fase 1 (Core)** del [plan general](../../plan-slrd.md):
scaffolding, auth, dashboard con el SLRD real y registro rápido. Las fases 2–4
(ciclos, confort, PWA/deploy) tienen sus propios specs.

## 1. Objetivo verificable

Poder **registrar un gasto y ver el SLRD bajar** en la app real, autenticada,
leyendo y escribiendo contra el Supabase de Fase 0 (proyecto `MiBanko`,
`feljshqybemysbokqedp`).

## 2. Decisiones de producto (del brainstorming)

| Dimensión | Decisión |
|---|---|
| Tono / estética | Editorial y con carácter: layout asimétrico, tipografía con personalidad, micro-animaciones vivas. El SLRD es el héroe y debe seguir siendo legible. |
| Tema | Oscuro comprometido (un solo tema). Base off-black (zinc-950), **nunca** negro puro. Acento único esmeralda. Números en mono. |
| Registro | Una sola pantalla, monto protagonista con teclado numérico propio; chips con defaults (BICE · gasto · wallet_pixel · categoría); un tap para guardar. |
| Navegación | Barra inferior con botón central. En Fase 1 solo *Inicio* y *Registrar* activos; el resto atenuado. |
| Datos/estado | `supabase-js` + TanStack Query + capa de hooks tipada. Update optimista en el registro. |

## 3. Stack y convenciones

- Vite + React + TypeScript + Tailwind (SPA cliente). Sin RSC (no es Next).
- `supabase-js` con la **publishable key** en el frontend; la seguridad la da la RLS de Fase 0.
- TanStack Query como "estado servidor". Sin estado global adicional (no Zustand).
- React Router para navegación.
- Framer Motion para animaciones, **aislado** en componentes hoja chicos y memoizados.
- Tipografía: `Geist` (o `Satoshi`) para UI + `JetBrains Mono` (o `Geist Mono`) para números. Serif prohibido (es un dashboard).
- Iconos: `@phosphor-icons/react` con `strokeWidth` estandarizado. Sin emojis.
- Tokens de tema (color, radios, sombras tintadas, tipografía) en `tailwind.config` + CSS vars.
- Formateo: CLP sin decimales, separador de miles (`45.000`), negativos para deuda.

## 4. Estructura del proyecto

```
src/
  lib/
    supabase.ts          # cliente único (publishable key + sesión persistente)
    queryClient.ts       # config TanStack Query
    format.ts            # formateo CLP (funciones puras)
  auth/
    AuthProvider.tsx     # sesión + guard
    LoginScreen.tsx      # email + password (registro deshabilitado)
  data/
    useSlrd.ts
    useAccounts.ts
    useCategories.ts
    useRegisterTransaction.ts
    slrdDelta.ts         # función pura: cuánto mueve el SLRD una transacción
  features/
    dashboard/           # SLRD hero, desglose, frescura, próximo vencimiento
    registro/            # pantalla de registro rápido
  components/
    ui/                  # Chip, NumberPad, MoneyText, Skeleton, BottomSheet...
    motion/              # wrappers de animación aislados y memoizados
  app/
    AppShell.tsx         # layout + barra inferior con botón central
    router.tsx
  theme/
    tokens.css
  types/
    db.ts                # tipos generados de Supabase
```

**Regla de aislamiento:** los componentes nunca llaman a `supabase-js` directo;
siempre pasan por un hook de `data/`. Esto los hace testeables (mock del hook) y
aísla el schema.

## 5. Capa de datos

### 5.1 `useSlrd()`
Lee `SELECT * FROM v_slrd` (la RLS filtra por `auth.uid()`; devuelve 1 fila).
Convierte los `numeric` (que Supabase entrega como string) a `number` una sola vez
en el borde. Expone: `slrdInmediato`, `slrdTotal`, `saldoContable`, `saldoDebito`,
`saldoInversion`, `deudaFacturada`, `deudaNoFacturada`, `isLoading`, `isError`.
`staleTime` corto; se invalida al registrar.

### 5.2 `slrdDelta(tx)` — función pura (fuente de verdad del lado cliente)
Dada `{ tipo, cuentaType, billingCycleId, amount }` devuelve cuánto mueve el SLRD:

| Caso | Delta al SLRD |
|---|---|
| `gasto` en cuenta `credit` sin ciclo (`billingCycleId == null`) | `-amount` |
| `gasto` en cuenta `credit` con ciclo | `0` (ya facturado, manda la boleta) |
| cualquier tipo en cuenta `debit`/`investment` | `0` (solo analítica; entra vía snapshot) |
| `ingreso`, `pago_tarjeta`, `transferencia_interna` | `0` (no afectan el SLRD directamente) |

Debe ser idéntica en espíritu a la vista `v_slrd` para que optimista y server no discrepen.

### 5.3 `useRegisterTransaction()` — insert con update optimista
1. `onMutate`: cancela refetches en vuelo, snapshot del `v_slrd` actual.
2. Aplica `slrdDelta(tx)` localmente → el número baja **de inmediato**.
3. `INSERT` en `transactions` (`user_id` lo pone el `default auth.uid()`).
4. `onSuccess`: invalida `v_slrd` y reconcilia con el valor real del server.
5. `onError`: rollback al snapshot + estado de error inline (sin perder lo tipeado).

### 5.4 `useAccounts()` / `useCategories()`
Alimentan chips y selector del registro. Caché larga. Cuentas ordenadas para que
**BICE** quede como default preseleccionado.

## 6. Pantallas

### 6.1 Dashboard (Inicio)
- Saludo + **aviso de frescura** ("snapshot hace N días" si N > 7, según el plan general).
- **SLRD inmediato**: número gigante en esmeralda + mono, protagonista, con count-up al cargar.
- **Saldo contable tachado** debajo, gris apagado, tachón coral, con "lo que el banco te muestra".
- **SLRD total** (con Fintual) como línea secundaria.
- **Desglose de deuda** sin tarjetas, solo `border-t` y espacio: "Facturado BICE" (con próximo vencimiento y alerta) y "Ciclo actual" (sin facturar). Montos en coral, mono, a la derecha.
- Layout asimétrico, alineado a la izquierda; colapsa a una columna en móvil.

### 6.2 Registro rápido
- Monto arriba, gigante y en mono, con **teclado numérico propio** (sin decimales, formatea miles al tipear).
- Fila de **chips preseleccionados** (cuenta, tipo, canal, categoría); tocar un chip abre un `BottomSheet` con opciones.
- Campo **descripción** opcional, discreto.
- Botón **Guardar** grande al alcance del pulgar; `scale(0.98)` en `:active`.
- Al guardar: update optimista → vuelve al dashboard con el SLRD ya bajado.

## 7. Auth
- `LoginScreen` (email + password) contra Supabase Auth. Registro deshabilitado.
- Sesión persistente (refresh token): login una vez.
- `AuthProvider` envuelve la app; si no hay sesión, redirige a login.

## 8. Estados obligatorios
- **Loading:** skeletons con la forma real (no spinners).
- **Empty:** si no hay snapshots, el dashboard lo dice con una invitación a cargar el primero — nunca un `$0` falso (principio de honestidad del dato).
- **Error:** reporte inline claro con reintento.

## 9. Testing
- `slrdDelta()`: unitarios AAA, un test por regla de la tabla 5.2.
- `format.ts`: miles, sin decimales, negativos.
- Hooks de datos con `supabase-js` mockeado: verificar update optimista y rollback.
- Herramientas: Vitest + React Testing Library.

## 10. Fuera de alcance de Fase 1
- Pantallas de snapshots, ciclo BICE, historial/analítica, configuración (fases 2–3).
- Suscripciones + cron (fase 3).
- PWA / deploy en Vercel (fase 4).
- La barra inferior muestra esos tabs atenuados, sin navegación aún.

## 11. Pasos manuales previos (config de Supabase, no-código)
Heredados de Fase 0, necesarios para que la auth funcione en producción:
1. Cambiar la clave temporal de la usuaria (`MiBanko-temporal-2026`).
2. Deshabilitar el registro de nuevos usuarios (Auth settings).
3. (Opcional) Habilitar protección de contraseñas filtradas.
