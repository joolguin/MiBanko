# Historial del SLRD (3b-i) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir el SLRD diario en una tabla `slrd_history` (cron + app) y agregar la pantalla Historial con un gráfico SVG "SLRD inmediato vs saldo contable".

**Architecture:** Migración 0007 crea la tabla, su RLS y la RPC `snapshot_slrd()` (security definer, dual-mode, idempotente por día, TZ America/Santiago) más el cron. El front lee vía un hook TanStack Query, dispara el snapshot al abrir la app (gemelo de `SubscriptionCatchUp`), escala los puntos con lógica pura testeable y los dibuja en un SVG a mano. La navegación activa el tab "Historial" hoy deshabilitado.

**Tech Stack:** React 19 + TypeScript, TanStack Query, Tailwind, Vitest + Testing Library, Supabase (Postgres + pg_cron). SVG a mano, sin librería de gráficos.

## Global Constraints

- Ningún componente llama `supabase-js` directo: siempre vía hooks en `src/data/`.
- Migración: el `.sql` en git es la fuente de verdad; se aplica al proyecto remoto `feljshqybemysbokqedp` vía MCP de Supabase (`apply_migration` / `execute_sql`) y se verifica con SQL usando `rollback` para no dejar datos. Próxima migración: **0007**.
- Timezone de cualquier cálculo por fecha: **America/Santiago**.
- Tests: lógica pura en `.test.ts`, componentes en `.test.tsx`, con `const user = userEvent.setup()`.
- Toda pantalla/sección: estados **loading (skeleton) / empty (texto tranquilo) / error (inline + retry)**.
- Commits: Conventional Commits, **sin** `Co-Authored-By` ni ningún trailer de co-autoría de IA.
- Colores del tema (tailwind.config.js): `accent` `#10b981`, `accent-bright` `#34d399`, `debt` `#dc6a5a`, `ink-line` `#27272a`, `ink-2` `#18181b`. Fuente mono para números: helpers `formatCLP` / `MoneyText`.

## File Structure

- `supabase/migrations/0007_slrd_history.sql` — tabla `slrd_history` + RLS + RPC `snapshot_slrd()` + cron.
- `src/data/types.ts` — agregar interfaz `SlrdHistoryPoint`.
- `src/data/useSlrdHistory.ts` — query + `mapSlrdHistoryRow`.
- `src/data/useSlrdHistory.test.tsx` — test del mapper.
- `src/data/chartScale.ts` — lógica pura: filtro por rango, dominio, mapeo a coordenadas SVG.
- `src/data/chartScale.test.ts` — tests de la lógica pura (AAA).
- `src/data/useSnapshotSlrd.ts` — dispara `snapshot_slrd` al abrir la app.
- `src/app/SlrdHistoryCatchUp.tsx` — monta el hook (gemelo de `SubscriptionCatchUp`).
- `src/App.tsx` — montar `<SlrdHistoryCatchUp />`.
- `src/features/historial/SlrdLineChart.tsx` — SVG a mano (2 líneas + tooltip).
- `src/features/historial/SlrdLineChart.test.tsx` — test de render/tooltip.
- `src/features/historial/HistorialScreen.tsx` — estados + chips de rango.
- `src/features/historial/HistorialScreen.test.tsx` — test de estados.
- `src/app/router.tsx` — ruta `/historial`.
- `src/app/AppShell.tsx` — activar el tab "Historial".

---

## Task 1: Migración 0007 — tabla, RLS, RPC y cron

**Files:**
- Create: `supabase/migrations/0007_slrd_history.sql`

**Interfaces:**
- Consumes: vista `public.v_slrd` (columnas: `user_id, saldo_debito, saldo_inversion, deuda_no_facturada, deuda_facturada, slrd_inmediato, slrd_total, saldo_contable`).
- Produces: tabla `public.slrd_history`, RPC `public.snapshot_slrd() returns int`, cron job `snapshot-slrd`.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/0007_slrd_history.sql`:

```sql
-- Sub-fase 3b-i: historial diario del SLRD.
-- Snapshotea la vista v_slrd (valor actual) en una fila por usuaria por día.
-- Mismo patrón que run_due_subscriptions (0005): security definer, dual-mode
-- (cron sin sesión = todas; app con sesión = solo la usuaria), idempotente por día.

-- 1. Tabla: una fila por usuaria por día con el desglose completo del SLRD.
create table if not exists public.slrd_history (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  snapshot_date      date not null,
  slrd_inmediato     numeric not null,
  slrd_total         numeric not null,
  saldo_contable     numeric not null,
  saldo_debito       numeric not null,
  saldo_inversion    numeric not null,
  deuda_facturada    numeric not null,
  deuda_no_facturada numeric not null,
  created_at         timestamptz not null default now()
);

-- 2. Idempotencia por día: un único snapshot por usuaria por fecha.
create unique index if not exists uq_slrd_history_user_day
  on public.slrd_history (user_id, snapshot_date);

-- 3. RLS: cada quien ve/escribe solo lo suyo. La RPC es security definer,
--    así que el cron sin sesión igual escribe.
alter table public.slrd_history enable row level security;
drop policy if exists slrd_history_owner on public.slrd_history;
create policy slrd_history_owner on public.slrd_history
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 4. Snapshot idempotente. Dual-mode: sin sesión (cron) recorre todas las usuarias;
--    con sesión (app) solo la usuaria actual. Upsert: la última llamada del día gana.
--    Devuelve # de filas afectadas.
create or replace function public.snapshot_slrd()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_hoy    date := (now() at time zone 'America/Santiago')::date;
  v_count  int  := 0;
begin
  insert into public.slrd_history
    (user_id, snapshot_date, slrd_inmediato, slrd_total, saldo_contable,
     saldo_debito, saldo_inversion, deuda_facturada, deuda_no_facturada)
  select
    v.user_id, v_hoy, v.slrd_inmediato, v.slrd_total, v.saldo_contable,
    v.saldo_debito, v.saldo_inversion, v.deuda_facturada, v.deuda_no_facturada
  from public.v_slrd v
  where v_caller is null or v.user_id = v_caller
  on conflict (user_id, snapshot_date) do update set
    slrd_inmediato     = excluded.slrd_inmediato,
    slrd_total         = excluded.slrd_total,
    saldo_contable     = excluded.saldo_contable,
    saldo_debito       = excluded.saldo_debito,
    saldo_inversion    = excluded.saldo_inversion,
    deuda_facturada    = excluded.deuda_facturada,
    deuda_no_facturada = excluded.deuda_no_facturada,
    created_at         = now();

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.snapshot_slrd() to authenticated;

-- 5. Cron diario. 09:10 UTC: 10 min después de run-due-subscriptions (0 9 * * *)
--    para que el snapshot del día ya refleje las suscripciones auto-cargadas.
create extension if not exists pg_cron;

-- idempotente: desprograma un job previo con el mismo nombre antes de crearlo.
select cron.unschedule(jobid) from cron.job where jobname = 'snapshot-slrd';
select cron.schedule('snapshot-slrd', '10 9 * * *',
  $$select public.snapshot_slrd();$$);
```

- [ ] **Step 2: Aplicar la migración al proyecto remoto**

Vía MCP de Supabase: `apply_migration` con name `0007_slrd_history` y el contenido del archivo.
Expected: aplica sin error.

- [ ] **Step 3: Verificar con SQL (con rollback, sin dejar datos)**

Vía MCP `execute_sql`, en una sola transacción:

```sql
begin;
-- (a) dispara el snapshot como cron (sin sesión -> todas las usuarias)
select public.snapshot_slrd() as filas_afectadas;
-- (b) la fila del día coincide con v_slrd
select h.slrd_inmediato = v.slrd_inmediato
   and h.saldo_contable = v.saldo_contable as coincide
from public.slrd_history h
join public.v_slrd v on v.user_id = h.user_id
where h.snapshot_date = (now() at time zone 'America/Santiago')::date;
-- (c) segunda llamada no duplica (upsert): sigue habiendo 1 fila por usuaria hoy
select public.snapshot_slrd();
select count(*) as filas_hoy from public.slrd_history
where snapshot_date = (now() at time zone 'America/Santiago')::date;
rollback;
```

Expected: (a) ≥ 1; (b) `coincide = true`; (c) `filas_hoy` = # de usuarias (1). Todo revertido por el `rollback`.

- [ ] **Step 4: Verificar el cron programado**

Vía MCP `execute_sql`:

```sql
select jobname, schedule from cron.job where jobname = 'snapshot-slrd';
```

Expected: una fila `snapshot-slrd | 10 9 * * *`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_slrd_history.sql
git commit -m "feat(fase3b-i): tabla slrd_history, rpc snapshot_slrd y cron diario"
```

---

## Task 2: Tipo y hook de lectura del historial

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/useSlrdHistory.ts`
- Test: `src/data/useSlrdHistory.test.tsx`

**Interfaces:**
- Consumes: tabla `public.slrd_history` (Task 1); patrón `mapCycleRow` de `src/data/useUnpaidCycles.ts`.
- Produces:
  - `interface SlrdHistoryPoint { snapshotDate: string; slrdInmediato: number; slrdTotal: number; saldoContable: number; saldoDebito: number; saldoInversion: number; deudaFacturada: number; deudaNoFacturada: number }`
  - `mapSlrdHistoryRow(row: Record<string, string | number | null>): SlrdHistoryPoint`
  - `useSlrdHistory(): UseQueryResult<SlrdHistoryPoint[]>` (queryKey `['slrd-history']`).

- [ ] **Step 1: Escribir el test del mapper (falla)**

Create `src/data/useSlrdHistory.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { mapSlrdHistoryRow } from './useSlrdHistory'

describe('mapSlrdHistoryRow', () => {
  it('should_MapSnakeCaseRow_When_GivenDbRow', () => {
    const row = {
      snapshot_date: '2026-07-09',
      slrd_inmediato: '1000', slrd_total: 1500, saldo_contable: '2000',
      saldo_debito: 1200, saldo_inversion: 500,
      deuda_facturada: '100', deuda_no_facturada: 100,
    }

    const point = mapSlrdHistoryRow(row)

    expect(point).toEqual({
      snapshotDate: '2026-07-09',
      slrdInmediato: 1000, slrdTotal: 1500, saldoContable: 2000,
      saldoDebito: 1200, saldoInversion: 500,
      deudaFacturada: 100, deudaNoFacturada: 100,
    })
  })

  it('should_DefaultNumbersToZero_When_FieldsAreNull', () => {
    const point = mapSlrdHistoryRow({ snapshot_date: '2026-07-09', slrd_inmediato: null })

    expect(point.slrdInmediato).toBe(0)
    expect(point.saldoContable).toBe(0)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/data/useSlrdHistory.test.tsx`
Expected: FAIL ("mapSlrdHistoryRow is not a function" / módulo no encontrado).

- [ ] **Step 3: Agregar el tipo en types.ts**

Add to `src/data/types.ts` (después de `interface Slrd`):

```ts
export interface SlrdHistoryPoint {
  snapshotDate: string
  slrdInmediato: number
  slrdTotal: number
  saldoContable: number
  saldoDebito: number
  saldoInversion: number
  deudaFacturada: number
  deudaNoFacturada: number
}
```

- [ ] **Step 4: Escribir el hook**

Create `src/data/useSlrdHistory.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SlrdHistoryPoint } from './types'

export function mapSlrdHistoryRow(row: Record<string, string | number | null>): SlrdHistoryPoint {
  const n = (v: string | number | null) => Number(v ?? 0)
  return {
    snapshotDate: String(row.snapshot_date),
    slrdInmediato: n(row.slrd_inmediato),
    slrdTotal: n(row.slrd_total),
    saldoContable: n(row.saldo_contable),
    saldoDebito: n(row.saldo_debito),
    saldoInversion: n(row.saldo_inversion),
    deudaFacturada: n(row.deuda_facturada),
    deudaNoFacturada: n(row.deuda_no_facturada),
  }
}

export function useSlrdHistory() {
  return useQuery({
    queryKey: ['slrd-history'],
    queryFn: async (): Promise<SlrdHistoryPoint[]> => {
      const { data, error } = await supabase
        .from('slrd_history')
        .select('snapshot_date, slrd_inmediato, slrd_total, saldo_contable, saldo_debito, saldo_inversion, deuda_facturada, deuda_no_facturada')
        .order('snapshot_date')
      if (error) throw error
      return (data as Record<string, string | number | null>[]).map(mapSlrdHistoryRow)
    },
  })
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/data/useSlrdHistory.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/useSlrdHistory.ts src/data/useSlrdHistory.test.tsx
git commit -m "feat(fase3b-i): hook useSlrdHistory y tipo SlrdHistoryPoint"
```

---

## Task 3: Lógica pura de escala del gráfico

**Files:**
- Create: `src/data/chartScale.ts`
- Test: `src/data/chartScale.test.ts`

**Interfaces:**
- Consumes: `SlrdHistoryPoint` (Task 2).
- Produces:
  - `type ChartRange = '30d' | '90d' | 'all'`
  - `filterByRange(points: SlrdHistoryPoint[], range: ChartRange, today: Date): SlrdHistoryPoint[]`
  - `interface ChartGeometry { width: number; height: number }`
  - `interface Series { key: 'slrdInmediato' | 'saldoContable'; path: string }`
  - `buildChart(points: SlrdHistoryPoint[], geo: ChartGeometry): { yMin: number; yMax: number; series: Series[]; x: (i: number) => number; y: (value: number) => number }`

- [ ] **Step 1: Escribir los tests (fallan)**

Create `src/data/chartScale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { filterByRange, buildChart } from './chartScale'
import type { SlrdHistoryPoint } from './types'

function point(date: string, slrd: number, contable: number): SlrdHistoryPoint {
  return {
    snapshotDate: date,
    slrdInmediato: slrd, slrdTotal: slrd, saldoContable: contable,
    saldoDebito: 0, saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
  }
}

describe('filterByRange', () => {
  const today = new Date('2026-07-09T12:00:00-04:00')
  const points = [
    point('2026-01-01', 1, 1),
    point('2026-06-20', 2, 2), // ~19 días atrás
    point('2026-07-08', 3, 3), // ayer
  ]

  it('should_KeepOnlyLast30Days_When_Range30d', () => {
    const result = filterByRange(points, '30d', today)

    expect(result.map((p) => p.snapshotDate)).toEqual(['2026-06-20', '2026-07-08'])
  })

  it('should_KeepAll_When_RangeAll', () => {
    const result = filterByRange(points, 'all', today)

    expect(result).toHaveLength(3)
  })
})

describe('buildChart', () => {
  const geo = { width: 300, height: 100 }
  const points = [point('2026-07-08', 0, 100), point('2026-07-09', 50, 150)]

  it('should_ComputeDomainFromBothSeries_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.yMin).toBe(0)
    expect(chart.yMax).toBe(150)
  })

  it('should_MapFirstAndLastX_ToEdges', () => {
    const chart = buildChart(points, geo)

    expect(chart.x(0)).toBe(0)
    expect(chart.x(1)).toBe(300)
  })

  it('should_MapMaxValue_ToTopAndMinToBottom', () => {
    const chart = buildChart(points, geo)

    expect(chart.y(150)).toBe(0)   // valor máximo arriba (y=0)
    expect(chart.y(0)).toBe(100)   // valor mínimo abajo (y=height)
  })

  it('should_BuildTwoSeriesPaths_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.series.map((s) => s.key)).toEqual(['slrdInmediato', 'saldoContable'])
    expect(chart.series[0].path.startsWith('M')).toBe(true)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/data/chartScale.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir la lógica pura**

Create `src/data/chartScale.ts`:

```ts
import type { SlrdHistoryPoint } from './types'

export type ChartRange = '30d' | '90d' | 'all'

const RANGE_DAYS: Record<Exclude<ChartRange, 'all'>, number> = { '30d': 30, '90d': 90 }
const MS_PER_DAY = 86_400_000

export function filterByRange(
  points: SlrdHistoryPoint[],
  range: ChartRange,
  today: Date,
): SlrdHistoryPoint[] {
  if (range === 'all') return points
  const cutoff = today.getTime() - RANGE_DAYS[range] * MS_PER_DAY
  return points.filter((p) => new Date(`${p.snapshotDate}T00:00:00-04:00`).getTime() >= cutoff)
}

export interface ChartGeometry {
  width: number
  height: number
}

export interface Series {
  key: 'slrdInmediato' | 'saldoContable'
  path: string
}

const SERIES_KEYS: Series['key'][] = ['slrdInmediato', 'saldoContable']

export function buildChart(points: SlrdHistoryPoint[], geo: ChartGeometry) {
  const values = points.flatMap((p) => [p.slrdInmediato, p.saldoContable])
  const yMin = Math.min(...values)
  const yMax = Math.max(...values)
  const span = yMax - yMin || 1 // evita división por cero con una sola muestra plana
  const lastIndex = points.length - 1 || 1

  const x = (i: number) => (i / lastIndex) * geo.width
  const y = (value: number) => geo.height - ((value - yMin) / span) * geo.height

  const series: Series[] = SERIES_KEYS.map((key) => ({
    key,
    path: points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`)
      .join(' '),
  }))

  return { yMin, yMax, series, x, y }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/data/chartScale.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/chartScale.ts src/data/chartScale.test.ts
git commit -m "feat(fase3b-i): logica pura de escala del grafico (filtro, dominio, paths)"
```

---

## Task 4: Disparo del snapshot al abrir la app

**Files:**
- Create: `src/data/useSnapshotSlrd.ts`
- Create: `src/app/SlrdHistoryCatchUp.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: RPC `snapshot_slrd` (Task 1); patrón de `src/data/useRunDueSubscriptions.ts` y `src/app/SubscriptionCatchUp.tsx`.
- Produces: `useSnapshotSlrd(): void`, componente `SlrdHistoryCatchUp`.

**Nota de diseño:** el snapshot es un upsert idempotente del valor actual; corre una vez por carga de app (el componente se monta una sola vez en la raíz). Sin guard de localStorage: si una carga temprana lo tomó antes de que se aplicaran las suscripciones del día, la próxima carga lo corrige, y el cron de las 09:10 UTC es la autoridad. `snapshot_slrd` invalida `['slrd-history']` al terminar.

- [ ] **Step 1: Escribir el hook**

Create `src/data/useSnapshotSlrd.ts`:

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Snapshotea el SLRD del día al abrir la app (upsert idempotente en el server).
// Gemelo de useRunDueSubscriptions, pero sin guard diario: el upsert es barato
// y self-correcting, así que corre una vez por carga de app.
export function useSnapshotSlrd(): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined') return
    supabase.rpc('snapshot_slrd').then(({ error }) => {
      if (error) return
      qc.invalidateQueries({ queryKey: ['slrd-history'] })
    })
  }, [qc])
}
```

- [ ] **Step 2: Escribir el componente de montaje**

Create `src/app/SlrdHistoryCatchUp.tsx`:

```tsx
import { useSnapshotSlrd } from '../data/useSnapshotSlrd'

export function SlrdHistoryCatchUp() {
  useSnapshotSlrd()
  return null
}
```

- [ ] **Step 3: Montarlo en App.tsx**

En `src/App.tsx`, agregar el import y el componente junto a `SubscriptionCatchUp` (el snapshot va después para que corra tras el catch-up de suscripciones):

```tsx
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { SubscriptionCatchUp } from './app/SubscriptionCatchUp'
import { SlrdHistoryCatchUp } from './app/SlrdHistoryCatchUp'
import { router } from './app/router'

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <SubscriptionCatchUp />
        <SlrdHistoryCatchUp />
        <RouterProvider router={router} />
      </RequireAuth>
    </AuthProvider>
  )
}
```

- [ ] **Step 4: Verificar typecheck y build de tests**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/data/useSnapshotSlrd.ts src/app/SlrdHistoryCatchUp.tsx src/App.tsx
git commit -m "feat(fase3b-i): dispara snapshot_slrd al abrir la app"
```

---

## Task 5: Componente SlrdLineChart (SVG a mano)

**Files:**
- Create: `src/features/historial/SlrdLineChart.tsx`
- Test: `src/features/historial/SlrdLineChart.test.tsx`

**Interfaces:**
- Consumes: `SlrdHistoryPoint` (Task 2); `buildChart`, `ChartGeometry` (Task 3); `MoneyText` (`src/components/ui/MoneyText.tsx`).
- Produces: `SlrdLineChart({ points }: { points: SlrdHistoryPoint[] })`.

- [ ] **Step 1: Escribir el test (falla)**

Create `src/features/historial/SlrdLineChart.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlrdLineChart } from './SlrdLineChart'
import type { SlrdHistoryPoint } from '../../data/types'

function point(date: string, slrd: number, contable: number): SlrdHistoryPoint {
  return {
    snapshotDate: date,
    slrdInmediato: slrd, slrdTotal: slrd, saldoContable: contable,
    saldoDebito: 0, saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
  }
}

describe('SlrdLineChart', () => {
  const points = [point('2026-07-08', 100, 200), point('2026-07-09', 150, 250)]

  it('should_RenderTwoSeriesPaths_When_GivenPoints', () => {
    const { container } = render(<SlrdLineChart points={points} />)

    expect(container.querySelectorAll('path[data-series]')).toHaveLength(2)
  })

  it('should_ShowTooltipWithBreakdown_When_PointHovered', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.hover(screen.getByTestId('point-2026-07-09'))

    expect(screen.getByText('2026-07-09')).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/SlrdLineChart.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir el componente**

Create `src/features/historial/SlrdLineChart.tsx`:

```tsx
import { useState } from 'react'
import { buildChart } from '../../data/chartScale'
import type { SlrdHistoryPoint } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'

const GEOMETRY = { width: 320, height: 160 }
const DOT_RADIUS = 10 // radio del área táctil invisible por punto

export function SlrdLineChart({ points }: { points: SlrdHistoryPoint[] }) {
  const [active, setActive] = useState<SlrdHistoryPoint | null>(null)
  const chart = buildChart(points, GEOMETRY)

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`}
        className="w-full h-auto"
        role="img"
        aria-label="SLRD inmediato vs saldo contable en el tiempo"
      >
        <path data-series="saldoContable" d={chart.series[1].path}
          fill="none" stroke="#52525b" strokeWidth={1.5} strokeDasharray="4 3" />
        <path data-series="slrdInmediato" d={chart.series[0].path}
          fill="none" stroke="#34d399" strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={p.snapshotDate}
            data-testid={`point-${p.snapshotDate}`}
            cx={chart.x(i)} cy={chart.y(p.slrdInmediato)} r={DOT_RADIUS}
            fill="transparent"
            onMouseEnter={() => setActive(p)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </svg>

      <div className="flex gap-4 mt-2 text-[11px]">
        <span className="text-accent-bright">— SLRD inmediato</span>
        <span className="text-zinc-500">- - saldo contable</span>
      </div>

      {active && (
        <div className="mt-3 p-3 rounded-lg border border-ink-line text-sm">
          <p className="text-zinc-400">{active.snapshotDate}</p>
          <div className="flex justify-between mt-1">
            <span className="text-accent-bright">SLRD inmediato</span>
            <MoneyText value={active.slrdInmediato} className="text-accent-bright" />
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">saldo contable</span>
            <MoneyText value={active.saldoContable} className="text-zinc-500" />
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">deuda facturada</span>
            <MoneyText value={active.deudaFacturada} className="text-zinc-500" />
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">deuda no facturada</span>
            <MoneyText value={active.deudaNoFacturada} className="text-zinc-500" />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/SlrdLineChart.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/SlrdLineChart.tsx src/features/historial/SlrdLineChart.test.tsx
git commit -m "feat(fase3b-i): grafico SVG SlrdLineChart con tooltip de desglose"
```

---

## Task 6: HistorialScreen con estados y chips de rango

**Files:**
- Create: `src/features/historial/HistorialScreen.tsx`
- Test: `src/features/historial/HistorialScreen.test.tsx`

**Interfaces:**
- Consumes: `useSlrdHistory` (Task 2), `filterByRange`/`ChartRange` (Task 3), `SlrdLineChart` (Task 5), `Skeleton` (`src/components/ui/Skeleton.tsx`).
- Produces: `HistorialScreen()`.

**Estados (obligatorios):** loading → `Skeleton`; error → texto `text-debt` + botón "Reintentar" (`refetch`); empty (`< 2` puntos) → texto tranquilo; ok → chips 30d/90d/Todo (default `30d`) + `SlrdLineChart` con los puntos filtrados.

**Constante:** `MIN_POINTS_FOR_CHART = 2` (una línea necesita ≥ 2 puntos).

- [ ] **Step 1: Escribir el test (falla)**

Create `src/features/historial/HistorialScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistorialScreen } from './HistorialScreen'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import type { SlrdHistoryPoint } from '../../data/types'

vi.mock('../../data/useSlrdHistory')

function point(date: string, slrd: number): SlrdHistoryPoint {
  return {
    snapshotDate: date,
    slrdInmediato: slrd, slrdTotal: slrd, saldoContable: slrd + 100,
    saldoDebito: 0, saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('HistorialScreen', () => {
  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({ isLoading: true, isError: false } as any)

    const { container } = render(<HistorialScreen />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should_ShowRetry_When_Error', async () => {
    const refetch = vi.fn()
    vi.mocked(useSlrdHistory).mockReturnValue({ isLoading: false, isError: true, refetch } as any)
    const user = userEvent.setup()

    render(<HistorialScreen />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(refetch).toHaveBeenCalled()
  })

  it('should_ShowCalmEmpty_When_FewerThanTwoPoints', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({
      isLoading: false, isError: false, data: [point('2026-07-09', 100)],
    } as any)

    render(<HistorialScreen />)

    expect(screen.getByText(/el historial se arma solo/i)).toBeInTheDocument()
  })

  it('should_RenderChart_When_EnoughPoints', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({
      isLoading: false, isError: false,
      data: [point('2026-07-08', 100), point('2026-07-09', 150)],
    } as any)

    const { container } = render(<HistorialScreen />)

    expect(container.querySelectorAll('path[data-series]').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/HistorialScreen.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir la pantalla**

Create `src/features/historial/HistorialScreen.tsx`:

```tsx
import { useState } from 'react'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import { filterByRange, type ChartRange } from '../../data/chartScale'
import { SlrdLineChart } from './SlrdLineChart'
import { Skeleton } from '../../components/ui/Skeleton'

const MIN_POINTS_FOR_CHART = 2
const RANGES: { value: ChartRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'Todo' },
]

export function HistorialScreen() {
  const history = useSlrdHistory()
  const [range, setRange] = useState<ChartRange>('30d')

  const points = history.data ?? []
  const visible = filterByRange(points, range, new Date())

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">historial del slrd</p>

      {history.isLoading && <Skeleton className="h-48 w-full mt-4" />}

      {history.isError && (
        <div className="mt-4">
          <p className="text-debt text-sm">No se pudo cargar el historial. Reintentá.</p>
          <button onClick={() => history.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">
            Reintentar
          </button>
        </div>
      )}

      {!history.isLoading && !history.isError && points.length < MIN_POINTS_FOR_CHART && (
        <p className="text-sm text-zinc-500 mt-4">
          El historial se arma solo: guardamos el SLRD de cada día. Volvé mañana para ver la tendencia.
        </p>
      )}

      {!history.isLoading && !history.isError && points.length >= MIN_POINTS_FOR_CHART && (
        <>
          <div className="flex gap-2 mt-4">
            {RANGES.map((r) => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] ${
                  range === r.value ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
                }`}>
                {r.label}
              </button>
            ))}
          </div>
          {visible.length >= MIN_POINTS_FOR_CHART ? (
            <SlrdLineChart points={visible} />
          ) : (
            <p className="text-sm text-zinc-500 mt-4">Sin datos en este rango.</p>
          )}
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/HistorialScreen.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/HistorialScreen.tsx src/features/historial/HistorialScreen.test.tsx
git commit -m "feat(fase3b-i): HistorialScreen con estados y chips de rango"
```

---

## Task 7: Activar la navegación a Historial

**Files:**
- Modify: `src/app/router.tsx`
- Modify: `src/app/AppShell.tsx`

**Interfaces:**
- Consumes: `HistorialScreen` (Task 6), `AppShell`.
- Produces: ruta `/historial` y tab activo.

- [ ] **Step 1: Agregar la ruta**

En `src/app/router.tsx`, importar y agregar la ruta:

```tsx
import { HistorialScreen } from '../features/historial/HistorialScreen'
```

Y agregar al array de rutas (después de `/ciclo`):

```tsx
  { path: '/historial', element: <AppShell><HistorialScreen /></AppShell> },
```

- [ ] **Step 2: Activar el tab en AppShell**

En `src/app/AppShell.tsx`, reemplazar la línea del NavItem deshabilitado:

```tsx
        <NavItem disabled label="Historial" icon={<ChartLine size={22} />} />
```

por:

```tsx
        <NavItem to="/historial" active={pathname === '/historial'} label="Historial" icon={<ChartLine size={22} />} />
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Correr toda la suite + lint**

Run: `npx vitest run && npx oxlint`
Expected: todos los tests PASS, lint sin errores.

- [ ] **Step 5: Commit**

```bash
git add src/app/router.tsx src/app/AppShell.tsx
git commit -m "feat(fase3b-i): activa la navegacion a la pantalla Historial"
```

---

## Verificación final (antes de finishing-a-development-branch)

- [ ] `npx tsc --noEmit` sin errores.
- [ ] `npx vitest run` — toda la suite en verde.
- [ ] `npx oxlint` sin errores.
- [ ] `npm run build` genera el bundle sin librerías nuevas de gráficos.
- [ ] Migración 0007 aplicada en remoto y cron `snapshot-slrd` listado.
- [ ] Tab "Historial" navegable; estados loading/empty/error visibles según datos.
