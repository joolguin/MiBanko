# Sub-fase 3b-i — Historial del SLRD (diseño)

**Fecha:** 2026-07-09 · **Rama:** `feat/fase3b-i-historial-slrd` · **Estado:** aprobado

## 1. Contexto y objetivo

La Fase 3 ("Confort") queda cerrada con la Sub-fase 3b. En brainstorming se decidió
**decomponer 3b** en dos piezas independientes, cada una con su propio spec/plan:

- **3b-i (este spec):** historial + gráfico del SLRD en el tiempo.
- **3b-ii (diferido):** analítica de gasto por categoría y lista de transacciones con filtros.

Hoy `v_slrd` (`supabase/migrations/0003_views.sql`) calcula **solo el valor actual** del SLRD
(sin historia). 3b-i agrega la persistencia diaria de ese valor y una pantalla para verlo
evolucionar, contrastando el SLRD real contra el "saldo contable mentiroso".

## 2. Decisiones de diseño (brainstorming)

| Decisión | Elección | Motivo |
|---|---|---|
| Alcance | 3b-i primero (historial SLRD), 3b-ii aparte | Scope acotado y shippable; cierra la pieza núcleo |
| Librería de gráficos | **SVG a mano, 0 dependencias** | Constraint de bundle; control total del tema; escala testeable como lógica pura |
| Trigger del snapshot | **Cron + app (dual-mode, como 3a)** | Robusto ante free-tier que pausa el proyecto o días sin cron |
| Columnas snapshoteadas | **Desglose completo (7 métricas)** | Barato (1 fila/día); "extensible sin migración"; habilita tooltips ricos y 3b-ii |
| Series del gráfico | **slrd_inmediato vs saldo_contable** | Misma narrativa que el dashboard; desglose completo en el tooltip |
| Control de rango | **Chips 30d / 90d / Todo (default 30d)** | Filtro en cliente; suficiente para app personal |

### Detalles resueltos con default

- **Timing del cron:** `10 9 * * *` (09:10 UTC), 10 min después de `run-due-subscriptions`
  (`0 9 * * *`), para que el snapshot del día ya refleje las suscripciones auto-cargadas.
- **Sin backfill:** no existen datos históricos; el gráfico arranca vacío y se llena día a día.
  Con menos de 2 puntos, la pantalla muestra un empty tranquilo + el valor de hoy.

## 3. Constraints permanentes que aplican

- Ningún componente llama `supabase-js` directo: siempre vía hooks en `src/data/`.
- Migración = archivo `.sql` en git es la fuente de verdad; se aplica al proyecto remoto
  `feljshqybemysbokqedp` vía MCP de Supabase (`apply_migration` / `execute_sql`); se verifica
  con SQL usando rollback para no dejar datos. Próxima migración: **0007**.
- Timezone de cualquier cálculo por fecha: **America/Santiago**.
- Tests: lógica pura en `.test.ts`, componentes en `.test.tsx`, con `const user = userEvent.setup()`.
- Toda pantalla/sección: estados obligatorios **loading (skeleton) / empty (texto tranquilo) /
  error (inline + retry)**.
- Commits: Conventional Commits, **sin** `Co-Authored-By` ni trailers de co-autoría de IA.

## 4. Backend — migración `0007_slrd_history.sql`

### Tabla `slrd_history`

Una fila por usuaria por día:

```
id                  uuid  pk default gen_random_uuid()
user_id             uuid  not null   -- RLS: user_id = auth.uid()
snapshot_date       date  not null
slrd_inmediato      numeric not null
slrd_total          numeric not null
saldo_contable      numeric not null
saldo_debito        numeric not null
saldo_inversion     numeric not null
deuda_facturada     numeric not null
deuda_no_facturada  numeric not null
created_at          timestamptz not null default now()
```

- **RLS activado** con políticas `user_id = auth.uid()` para select e insert (patrón de las
  demás tablas). La RPC es `security definer`, así que el cron sin sesión igual escribe.
- **Índice único** `uq_slrd_history_user_day (user_id, snapshot_date)` → idempotencia por día.

### RPC `snapshot_slrd()`

Molde exacto de `run_due_subscriptions` (`0005_suscripciones_cron.sql`):

- `language plpgsql`, `security definer`, `set search_path = public`.
- **Dual-mode:** `v_caller := auth.uid()`; si `null` (cron) recorre todas las usuarias, si hay
  sesión (app) solo la usuaria actual.
- **Fecha:** `v_hoy := (now() at time zone 'America/Santiago')::date`.
- Lee `public.v_slrd` (una fila por usuaria) e inserta en `slrd_history` con
  `on conflict (user_id, snapshot_date) do update set ...` → **upsert idempotente**: si la app
  lo llama varias veces en el día, refleja el último valor.
- Devuelve `int` (# filas afectadas). `grant execute on function public.snapshot_slrd() to authenticated;`

### Cron (pg_cron, ya habilitado)

```sql
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'snapshot-slrd';  -- idempotente
select cron.schedule('snapshot-slrd', '10 9 * * *', $$select public.snapshot_slrd();$$);
```

### Verificación (sin dejar datos)

Vía MCP `execute_sql` dentro de una transacción con `rollback`:
1. `select public.snapshot_slrd();` → devuelve ≥1.
2. `select * from public.slrd_history where snapshot_date = (now() at time zone 'America/Santiago')::date;`
   → coincide con `select * from public.v_slrd;`.
3. Segunda llamada a `snapshot_slrd()` → sigue habiendo 1 fila para el día (upsert, no duplica).
4. `rollback`.

## 5. Capa de datos (`src/data/`)

- **`types.ts`** — agregar `SlrdHistoryPoint` (7 métricas + `snapshotDate: string`).
- **`useSlrdHistory.ts`** — query TanStack (`queryKey: ['slrd-history']`); lee `slrd_history`
  ordenado por `snapshot_date` asc; mapea filas → `SlrdHistoryPoint[]` con un `mapSlrdHistoryRow`
  (patrón de `mapSlrdRow` en `useSlrd.ts`, exportado para testear).
- **`useSnapshotSlrd.ts`** — mutation/efecto que llama `supabase.rpc('snapshot_slrd')` al abrir
  la app e invalida `['slrd-history']` (y `['slrd']` si aplica). Gemelo de `useRunDueSubscriptions.ts`.
- **`chartScale.ts`** — **lógica pura** (sin DOM, sin efectos), con `chartScale.test.ts` (AAA):
  - filtrar puntos por rango (`30d` / `90d` / `all`) usando fecha en America/Santiago;
  - calcular dominio `min`/`max` del eje Y sobre las series visibles;
  - mapear cada punto `(fecha, valor)` → coordenada SVG `(x, y)` y construir el `d` del `<path>`.
  - Constantes descriptivas para días por rango (sin números mágicos).

## 6. UI (`src/features/historial/`)

- **`HistorialScreen.tsx`** — orquesta los estados obligatorios:
  - loading → skeleton;
  - error → mensaje inline + botón retry (`refetch`);
  - empty (`<2` puntos) → texto tranquilo ("El historial se arma solo; volvé mañana para ver
    la tendencia") + valor de hoy si existe;
  - ok → chips de rango (30d/90d/Todo, default 30d) + `SlrdLineChart`.
- **`SlrdLineChart.tsx`** — SVG a mano:
  - 2 `<path>`: `slrd_inmediato` en color `accent`, `saldo_contable` tenue/gris (el "mentiroso");
  - ejes mínimos (min/max Y, primer/último día en X);
  - tooltip al tocar/hover un punto → día + desglose de las 7 métricas;
  - theme-aware (Tailwind, dark), responsive (`viewBox`, `width=100%`).
  - Recibe datos ya escalados por `chartScale.ts`; no contiene lógica de negocio.

## 7. Navegación

- **`src/app/router.tsx`** — agregar
  `{ path: '/historial', element: <AppShell><HistorialScreen /></AppShell> }`.
- **`src/app/AppShell.tsx`** — reemplazar `<NavItem disabled label="Historial" ...>` por
  `<NavItem to="/historial" active={pathname === '/historial'} label="Historial"
  icon={<ChartLine size={22} />} />` (mismo patrón con que se activó `/ajustes` en 3a).

## 8. Fuera de alcance (→ 3b-ii, spec aparte)

- Gasto por categoría con gráfico.
- Lista de transacciones con filtros.

## 9. Criterios de aceptación

1. Migración 0007 aplicada y verificada por SQL (con rollback); `.sql` commiteado.
2. `snapshot_slrd()` idempotente por día, dual-mode, TZ Santiago; cron `snapshot-slrd` a las
   09:10 UTC sin pisar `run-due-subscriptions`.
3. Al abrir la app se registra/actualiza el snapshot del día vía hook (sin llamar supabase-js
   desde componentes).
4. Pantalla `/historial` accesible desde el tab (ya no `disabled`) con los 3 estados obligatorios.
5. Gráfico SVG dibuja slrd_inmediato vs saldo_contable, chips 30d/90d/Todo (default 30d),
   tooltip con desglose; sin dependencias nuevas de gráficos.
6. Lógica de escala/filtrado cubierta por `chartScale.test.ts`; hook/mapeo cubiertos por tests.
7. `npm run` de lint + typecheck + tests en verde.
