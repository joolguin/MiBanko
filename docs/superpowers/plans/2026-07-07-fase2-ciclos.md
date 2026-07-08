# Fase 2 (Ciclos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simular el ciclo BICE completo — gastar → cerrar (deuda pasa de no-facturada a facturada, SLRD igual) → pagar (baja el snapshot de Santander, deuda facturada desaparece, SLRD igual).

**Architecture:** Dos funciones RPC transaccionales en Postgres (`close_cycle`, `pay_cycle`) para atomicidad; la derivación de fechas del ciclo es una función pura en el cliente (testeada, único lugar) que se pasa a `close_cycle`. Frontend extiende el patrón de Fase 1: hooks tipados sobre TanStack Query, pantallas oscuras editoriales reutilizando `NumberPad`/`BottomSheet`/`MoneyText`/`Chip`.

**Tech Stack:** Supabase (Postgres RPC, RLS), React + TS + Tailwind, TanStack Query, Vitest + Testing Library.

## Global Constraints

- CLP enteros, sin decimales; los `numeric` llegan como string → coerción a number en el borde de cada hook.
- Tema oscuro (base `#09090b`, nunca negro puro; acento esmeralda; coral `#dc6a5a` para deuda/negativos); números en mono; serif prohibido; sin emojis.
- Componentes nunca llaman a `supabase-js` directo: solo vía hooks de `src/data/`.
- `user_id` nunca se envía desde el cliente; lo pone `auth.uid()` (default o dentro de las RPC).
- Las RPC son `security invoker` (corren con la RLS de la usuaria).
- `min-h-[100dvh]`, no `h-screen`. Iconos `@phosphor-icons/react`. Commits Conventional; **sin** `Co-Authored-By`.
- Invariante SLRD: **cerrar** con `billed_amount == suma_ledger` no cambia el SLRD; **pagar** nunca cambia el `slrd_inmediato` (baja snapshot y baja deuda facturada por igual).
- Proyecto Supabase `feljshqybemysbokqedp`. Fechas de ciclo/config: `closing_day` y `due_day` en rango 1..28.

## File Structure

```
supabase/migrations/0004_bice_config_y_rpc.sql   # tabla bice_config + RLS + RPC close_cycle/pay_cycle + grants
src/types/db.ts                                   # regenerado (incluye bice_config + Functions)
src/data/
  cycleDates.ts        # deriveCycleDates (pura)
  types.ts             # + BiceConfig, CycleDates, BillingCycle, CloseCycleResult (extiende el existente)
  useBiceConfig.ts     # useBiceConfig + useSaveBiceConfig
  useCurrentCycle.ts   # useCurrentCycleTransactions (gastos BICE sin facturar + suma)
  useUnpaidCycles.ts   # useUnpaidCycles + usePaidCycles
  useSaveSnapshot.ts   # useSaveSnapshot (Santander/Fintual)
  useCloseCycle.ts     # RPC close_cycle
  usePayCycle.ts       # RPC pay_cycle
src/features/
  snapshots/SnapshotsScreen.tsx
  ciclo/CicloScreen.tsx
  ciclo/BiceConfigSheet.tsx
  ciclo/CloseCycleSheet.tsx
  ciclo/PayCycleSheet.tsx
src/app/router.tsx     # + rutas /ciclo y /snapshots
src/app/AppShell.tsx   # activar tab Ciclo (deja de estar atenuado)
```

---

### Task 1: Migración DB — `bice_config` + RPC `close_cycle` / `pay_cycle`

> **Ejecución:** esta tarea la corre el **controlador** vía el MCP de Supabase (los subagentes no lo tienen): `apply_migration`, luego `execute_sql` para los tests, luego regenerar `src/types/db.ts`. Guardar además el SQL en el archivo de migración local.

**Files:**
- Create: `supabase/migrations/0004_bice_config_y_rpc.sql`
- Modify: `src/types/db.ts` (regenerar)

**Interfaces:**
- Produces (RPC vía PostgREST):
  - `close_cycle(p_billed_amount numeric, p_cycle_start date, p_cycle_end date, p_due_date date) returns json` → `{ cycle_id, billed_amount, suma_ledger, diferencia }`
  - `pay_cycle(p_cycle_id uuid, p_santander_account_id uuid, p_nuevo_saldo numeric) returns void`
  - tabla `bice_config(user_id, closing_day, due_day, updated_at)`

- [ ] **Step 1: Escribir la migración** (`supabase/migrations/0004_bice_config_y_rpc.sql`)

```sql
-- bice_config: una fila por usuaria con los días fijos de corte y vencimiento
create table if not exists public.bice_config (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  closing_day int not null check (closing_day between 1 and 28),
  due_day     int not null check (due_day between 1 and 28),
  updated_at  timestamptz not null default now()
);

alter table public.bice_config enable row level security;
drop policy if exists bice_config_owner on public.bice_config;
create policy bice_config_owner on public.bice_config
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- close_cycle: inserta el ciclo y asigna los gastos BICE sueltos, atómico.
create or replace function public.close_cycle(
  p_billed_amount numeric,
  p_cycle_start date,
  p_cycle_end date,
  p_due_date date
) returns json
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_cycle_id uuid;
  v_suma numeric;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into public.bice_billing_cycles
    (user_id, cycle_start, cycle_end, due_date, billed_amount, is_paid)
  values
    (v_uid, p_cycle_start, p_cycle_end, p_due_date, p_billed_amount, false)
  returning id into v_cycle_id;

  update public.transactions t
  set billing_cycle_id = v_cycle_id
  from public.accounts a
  where t.account_id = a.id
    and t.user_id = v_uid
    and a.type = 'credit'
    and t.type = 'gasto'
    and t.billing_cycle_id is null;

  select coalesce(sum(amount), 0) into v_suma
  from public.transactions
  where billing_cycle_id = v_cycle_id;

  return json_build_object(
    'cycle_id', v_cycle_id,
    'billed_amount', p_billed_amount,
    'suma_ledger', v_suma,
    'diferencia', p_billed_amount - v_suma
  );
end;
$$;

-- pay_cycle: marca pagado y crea el snapshot de Santander, atómico.
create or replace function public.pay_cycle(
  p_cycle_id uuid,
  p_santander_account_id uuid,
  p_nuevo_saldo numeric
) returns void
language plpgsql
security invoker
as $$
declare
  v_uid uuid := auth.uid();
  v_rows int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  update public.bice_billing_cycles
  set is_paid = true
  where id = p_cycle_id and user_id = v_uid;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then raise exception 'cycle_not_found'; end if;

  insert into public.balance_snapshots (user_id, account_id, balance, snapshot_date)
  values (v_uid, p_santander_account_id, p_nuevo_saldo, now());
end;
$$;

grant execute on function public.close_cycle(numeric, date, date, date) to authenticated;
grant execute on function public.pay_cycle(uuid, uuid, numeric) to authenticated;
```

- [ ] **Step 2: Aplicar la migración** (controlador, MCP `apply_migration` con `name=0004_bice_config_y_rpc` y el SQL de arriba).

- [ ] **Step 3: Tests SQL de las RPC** (controlador, MCP `execute_sql`). Sobre la usuaria de seed, en una transacción de prueba que se revierte al final NO es posible vía MCP; en su lugar, probar y limpiar explícitamente:

```sql
-- Setup: resembrar el escenario base (reutiliza supabase/seed.sql si hace falta) y capturar ids.
-- Test A: close_cycle asigna los gastos sueltos y calcula la diferencia.
--   Precondición: hay 3 gastos BICE sin facturar (25000+15000+45000 = 85000).
--   Llamar close_cycle(90000, '2026-05-26','2026-06-25','2026-07-15').
--   Esperado: json.diferencia = 5000; suma_ledger = 85000; y ahora esos 3 gastos tienen billing_cycle_id = cycle_id.
-- Test B: v_slrd tras cerrar con billed=suma NO cambia el slrd_inmediato (comparar antes/después con billed=85000).
-- Test C: pay_cycle marca is_paid y crea snapshot; el slrd_inmediato queda igual si nuevo_saldo = saldo - billed.
-- Test D: pay_cycle con un cycle_id ajeno/inexistente lanza 'cycle_not_found'.
-- Al final, restaurar el seed conocido (re-ejecutar supabase/seed.sql) para no dejar datos sucios.
```

Ejecutar cada assert y confirmar el resultado esperado antes de continuar. Documentar los resultados.

- [ ] **Step 4: Regenerar tipos** (controlador, MCP `generate_typescript_types`) y sobrescribir `src/types/db.ts`. Verificar que `Database['public']['Functions']` ahora incluye `close_cycle` y `pay_cycle`, y `Tables` incluye `bice_config`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_bice_config_y_rpc.sql src/types/db.ts
git commit -m "feat(db): bice_config y RPC close_cycle/pay_cycle"
```

---

### Task 2: `deriveCycleDates` — derivación pura de fechas del ciclo (TDD)

**Files:**
- Create: `src/data/cycleDates.ts`
- Test: `src/data/cycleDates.test.ts`
- Modify: `src/data/types.ts` (agregar tipos)

**Interfaces:**
- Produces:
  - `types.ts`: `interface BiceConfig { closingDay: number; dueDay: number }`; `interface CycleDates { cycleStart: string; cycleEnd: string; dueDate: string }` (fechas `YYYY-MM-DD`).
  - `deriveCycleDates(config: BiceConfig, closingDate: Date): CycleDates`.

- [ ] **Step 1: Test que falla** (`src/data/cycleDates.test.ts`)

```ts
import { describe, it, expect } from 'vitest'
import { deriveCycleDates } from './cycleDates'

const config = { closingDay: 25, dueDay: 15 }

describe('deriveCycleDates', () => {
  it('should_DeriveCycle_When_ClosingMidMonthBeforeClosingDay', () => {
    // Cierro el 7-jul; el corte más reciente <= hoy es el 25-jun.
    expect(deriveCycleDates(config, new Date(Date.UTC(2026, 6, 7)))).toEqual({
      cycleStart: '2026-05-26', cycleEnd: '2026-06-25', dueDate: '2026-07-15',
    })
  })
  it('should_UseSameMonth_When_ClosingOnClosingDay', () => {
    expect(deriveCycleDates(config, new Date(Date.UTC(2026, 6, 25)))).toEqual({
      cycleStart: '2026-06-26', cycleEnd: '2026-07-25', dueDate: '2026-08-15',
    })
  })
  it('should_RollYear_When_ClosingInJanuaryBeforeClosingDay', () => {
    expect(deriveCycleDates(config, new Date(Date.UTC(2026, 0, 10)))).toEqual({
      cycleStart: '2025-11-26', cycleEnd: '2025-12-25', dueDate: '2026-01-15',
    })
  })
  it('should_DueSameMonth_When_DueDayAfterClosingDay', () => {
    // corte 5, vence 20 -> vencimiento en el mismo mes del corte.
    expect(deriveCycleDates({ closingDay: 5, dueDay: 20 }, new Date(Date.UTC(2026, 6, 10)))).toEqual({
      cycleStart: '2026-06-06', cycleEnd: '2026-07-05', dueDate: '2026-07-20',
    })
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- cycleDates`
Expected: FAIL (módulo/función no existe).

- [ ] **Step 3: Implementación** (`src/data/cycleDates.ts`)

```ts
import type { BiceConfig, CycleDates } from './types'

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

// Todas las fechas en UTC (day-only). closingDay/dueDay están en 1..28, sin problemas de fin de mes.
export function deriveCycleDates(config: BiceConfig, closingDate: Date): CycleDates {
  const { closingDay, dueDay } = config
  const y = closingDate.getUTCFullYear()
  const m = closingDate.getUTCMonth() // 0..11
  const day = closingDate.getUTCDate()

  // cycleEnd: el closingDay más reciente <= closingDate.
  let endY = y, endM = m
  if (day < closingDay) {
    endM -= 1
    if (endM < 0) { endM = 11; endY -= 1 }
  }
  const cycleEndDate = new Date(Date.UTC(endY, endM, closingDay))

  // cycleStart: (corte del período anterior) + 1 día.
  const prevEnd = new Date(Date.UTC(endY, endM - 1, closingDay)) // JS normaliza mes -1
  const cycleStartDate = addDays(prevEnd, 1)

  // dueDate: primer dueDay estrictamente después de cycleEnd.
  let dueY = endY, dueM = endM
  if (dueDay <= closingDay) {
    dueM += 1
    if (dueM > 11) { dueM = 0; dueY += 1 }
  }
  const dueDateDate = new Date(Date.UTC(dueY, dueM, dueDay))

  return { cycleStart: fmt(cycleStartDate), cycleEnd: fmt(cycleEndDate), dueDate: fmt(dueDateDate) }
}
```

Agregar a `src/data/types.ts`:

```ts
export interface BiceConfig { closingDay: number; dueDay: number }
export interface CycleDates { cycleStart: string; cycleEnd: string; dueDate: string }

export interface BillingCycle {
  id: string
  cycleStart: string
  cycleEnd: string
  dueDate: string
  billedAmount: number
  isPaid: boolean
}

export interface CloseCycleResult {
  cycleId: string
  billedAmount: number
  sumaLedger: number
  diferencia: number
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npm test -- cycleDates`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/cycleDates.ts src/data/cycleDates.test.ts src/data/types.ts
git commit -m "feat: derivacion pura de fechas del ciclo bice"
```

---

### Task 3: Hooks de datos de ciclo

**Files:**
- Create: `src/data/useBiceConfig.ts`, `src/data/useCurrentCycle.ts`, `src/data/useUnpaidCycles.ts`, `src/data/useSaveSnapshot.ts`, `src/data/useCloseCycle.ts`, `src/data/usePayCycle.ts`
- Test: `src/data/useCurrentCycle.test.tsx`

**Interfaces:**
- Consumes: `supabase`, tipos de `types.ts`, `Transaction`-like rows.
- Produces:
  - `useBiceConfig(): UseQueryResult<BiceConfig | null>` (key `['bice-config']`) + `mapConfigRow`.
  - `useSaveBiceConfig(): UseMutationResult<void, Error, BiceConfig>` (upsert).
  - `useCurrentCycleTransactions(): UseQueryResult<{ items: CycleTx[]; total: number }>` (key `['current-cycle']`) + `mapCycleTx`.
  - `useUnpaidCycles(): UseQueryResult<BillingCycle[]>` (key `['unpaid-cycles']`); `usePaidCycles()` (key `['paid-cycles']`); `mapCycleRow`.
  - `useSaveSnapshot(): UseMutationResult<void, Error, { accountId: string; balance: number }[]>`.
  - `useCloseCycle(): UseMutationResult<CloseCycleResult, Error, { billedAmount: number; dates: CycleDates }>`.
  - `usePayCycle(): UseMutationResult<void, Error, { cycleId: string; santanderAccountId: string; nuevoSaldo: number }>`.
  - Tipo `CycleTx { id: string; amount: number; description: string | null; transactionDate: string; categoryName: string | null }`.

- [ ] **Step 1: Test que falla de `mapCycleRow`** (`src/data/useCurrentCycle.test.tsx`)

```tsx
import { describe, it, expect } from 'vitest'
import { mapCycleRow } from './useUnpaidCycles'

describe('mapCycleRow', () => {
  it('should_MapStringNumericAndCamel_When_RowFromSupabase', () => {
    const row = {
      id: 'c1', cycle_start: '2026-05-26', cycle_end: '2026-06-25',
      due_date: '2026-07-15', billed_amount: '300000', is_paid: false,
    }
    expect(mapCycleRow(row)).toEqual({
      id: 'c1', cycleStart: '2026-05-26', cycleEnd: '2026-06-25',
      dueDate: '2026-07-15', billedAmount: 300000, isPaid: false,
    })
  })
})
```

- [ ] **Step 2: Verificar que falla**

Run: `npm test -- useCurrentCycle`
Expected: FAIL (no existe `mapCycleRow`).

- [ ] **Step 3: Implementar los hooks**

`src/data/useUnpaidCycles.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BillingCycle } from './types'

export function mapCycleRow(row: Record<string, string | number | boolean | null>): BillingCycle {
  return {
    id: String(row.id),
    cycleStart: String(row.cycle_start),
    cycleEnd: String(row.cycle_end),
    dueDate: String(row.due_date),
    billedAmount: Number(row.billed_amount ?? 0),
    isPaid: Boolean(row.is_paid),
  }
}

export function useUnpaidCycles() {
  return useQuery({
    queryKey: ['unpaid-cycles'],
    queryFn: async (): Promise<BillingCycle[]> => {
      const { data, error } = await supabase
        .from('bice_billing_cycles')
        .select('id, cycle_start, cycle_end, due_date, billed_amount, is_paid')
        .eq('is_paid', false)
        .order('due_date')
      if (error) throw error
      return (data as Record<string, string | number | boolean | null>[]).map(mapCycleRow)
    },
  })
}

export function usePaidCycles() {
  return useQuery({
    queryKey: ['paid-cycles'],
    queryFn: async (): Promise<BillingCycle[]> => {
      const { data, error } = await supabase
        .from('bice_billing_cycles')
        .select('id, cycle_start, cycle_end, due_date, billed_amount, is_paid')
        .eq('is_paid', true)
        .order('due_date', { ascending: false })
      if (error) throw error
      return (data as Record<string, string | number | boolean | null>[]).map(mapCycleRow)
    },
  })
}
```

`src/data/useCurrentCycle.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface CycleTx {
  id: string
  amount: number
  description: string | null
  transactionDate: string
  categoryName: string | null
}

export function useCurrentCycleTransactions() {
  return useQuery({
    queryKey: ['current-cycle'],
    queryFn: async (): Promise<{ items: CycleTx[]; total: number }> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, description, transaction_date, categories(name), accounts!inner(type)')
        .eq('type', 'gasto')
        .is('billing_cycle_id', null)
        .eq('accounts.type', 'credit')
        .order('transaction_date', { ascending: false })
      if (error) throw error
      const rows = data as unknown as Array<{
        id: string; amount: string | number; description: string | null;
        transaction_date: string; categories: { name: string } | null
      }>
      const items: CycleTx[] = rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount ?? 0),
        description: r.description,
        transactionDate: r.transaction_date,
        categoryName: r.categories?.name ?? null,
      }))
      const total = items.reduce((s, i) => s + i.amount, 0)
      return { items, total }
    },
  })
}
```

`src/data/useBiceConfig.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BiceConfig } from './types'

export function mapConfigRow(row: { closing_day: number; due_day: number } | null): BiceConfig | null {
  if (!row) return null
  return { closingDay: Number(row.closing_day), dueDay: Number(row.due_day) }
}

export function useBiceConfig() {
  return useQuery({
    queryKey: ['bice-config'],
    queryFn: async (): Promise<BiceConfig | null> => {
      const { data, error } = await supabase
        .from('bice_config').select('closing_day, due_day').maybeSingle()
      if (error) throw error
      return mapConfigRow(data as { closing_day: number; due_day: number } | null)
    },
  })
}

export function useSaveBiceConfig() {
  const qc = useQueryClient()
  return useMutation<void, Error, BiceConfig>({
    mutationFn: async (cfg) => {
      const { error } = await supabase.from('bice_config').upsert(
        { closing_day: cfg.closingDay, due_day: cfg.dueDay, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bice-config'] }),
  })
}
```

`src/data/useSaveSnapshot.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useSaveSnapshot() {
  const qc = useQueryClient()
  return useMutation<void, Error, { accountId: string; balance: number }[]>({
    mutationFn: async (snapshots) => {
      if (snapshots.length === 0) return
      const rows = snapshots.map((s) => ({ account_id: s.accountId, balance: s.balance }))
      const { error } = await supabase.from('balance_snapshots').insert(rows)
      if (error) throw new Error(error.message)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['snapshot-age'] })
    },
  })
}
```

`src/data/useCloseCycle.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { CloseCycleResult, CycleDates } from './types'

export function useCloseCycle() {
  const qc = useQueryClient()
  return useMutation<CloseCycleResult, Error, { billedAmount: number; dates: CycleDates }>({
    mutationFn: async ({ billedAmount, dates }) => {
      const { data, error } = await supabase.rpc('close_cycle', {
        p_billed_amount: billedAmount,
        p_cycle_start: dates.cycleStart,
        p_cycle_end: dates.cycleEnd,
        p_due_date: dates.dueDate,
      })
      if (error) throw new Error(error.message)
      const r = data as { cycle_id: string; billed_amount: number | string; suma_ledger: number | string; diferencia: number | string }
      return {
        cycleId: r.cycle_id,
        billedAmount: Number(r.billed_amount),
        sumaLedger: Number(r.suma_ledger),
        diferencia: Number(r.diferencia),
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['current-cycle'] })
      qc.invalidateQueries({ queryKey: ['unpaid-cycles'] })
    },
  })
}
```

`src/data/usePayCycle.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function usePayCycle() {
  const qc = useQueryClient()
  return useMutation<void, Error, { cycleId: string; santanderAccountId: string; nuevoSaldo: number }>({
    mutationFn: async ({ cycleId, santanderAccountId, nuevoSaldo }) => {
      const { error } = await supabase.rpc('pay_cycle', {
        p_cycle_id: cycleId,
        p_santander_account_id: santanderAccountId,
        p_nuevo_saldo: nuevoSaldo,
      })
      if (error) throw new Error(error.message)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['unpaid-cycles'] })
      qc.invalidateQueries({ queryKey: ['paid-cycles'] })
      qc.invalidateQueries({ queryKey: ['snapshot-age'] })
    },
  })
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx tsc --noEmit && npm test -- useCurrentCycle`
Expected: sin errores; PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/data/useBiceConfig.ts src/data/useCurrentCycle.ts src/data/useUnpaidCycles.ts src/data/useSaveSnapshot.ts src/data/useCloseCycle.ts src/data/usePayCycle.ts src/data/useCurrentCycle.test.tsx
git commit -m "feat: hooks de ciclo bice (config, current, unpaid, close, pay, snapshot)"
```

---

### Task 4: Pantalla Snapshots

**Files:**
- Create: `src/features/snapshots/SnapshotsScreen.tsx`
- Modify: `src/app/router.tsx` (ruta `/snapshots`)
- Test: `src/features/snapshots/SnapshotsScreen.test.tsx`

**Interfaces:**
- Consumes: `useAccounts`, `useSaveSnapshot`, `useSlrd` (para el último valor por cuenta se usa `useLatestSnapshotsByAccount`), `NumberPad`, `MoneyText`.
- Produces: pantalla con dos campos (Santander débito, Fintual investment).

- [ ] **Step 1: Hook auxiliar `useLatestSnapshotsByAccount`** (agregar en `src/data/useSaveSnapshot.ts`)

```ts
import { useQuery } from '@tanstack/react-query'

export interface LatestSnapshot { accountId: string; balance: number; snapshotDate: string }

export function useLatestSnapshotsByAccount() {
  return useQuery({
    queryKey: ['latest-snapshots'],
    queryFn: async (): Promise<Record<string, LatestSnapshot>> => {
      const { data, error } = await supabase
        .from('v_latest_snapshots').select('account_id, balance, snapshot_date')
      if (error) throw error
      const out: Record<string, LatestSnapshot> = {}
      for (const r of data as Array<{ account_id: string; balance: number | string; snapshot_date: string }>) {
        out[r.account_id] = { accountId: r.account_id, balance: Number(r.balance ?? 0), snapshotDate: r.snapshot_date }
      }
      return out
    },
  })
}
```

(Requiere `import { supabase } from '../lib/supabase'` ya presente en el archivo.)

- [ ] **Step 2: Test que falla** (`src/features/snapshots/SnapshotsScreen.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SnapshotsScreen } from './SnapshotsScreen'

vi.mock('../../data/useAccounts')
vi.mock('../../data/useSaveSnapshot')
import { useAccounts } from '../../data/useAccounts'
import { useSaveSnapshot, useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'

const mutate = vi.fn()
beforeEach(() => {
  vi.mocked(useAccounts).mockReturnValue({ data: [
    { id: 'sant', name: 'Santander Vista', type: 'debit', bank: 'Santander' },
    { id: 'fin', name: 'Fintual', type: 'investment', bank: 'Fintual' },
  ] } as any)
  vi.mocked(useLatestSnapshotsByAccount).mockReturnValue({ data: {
    sant: { accountId: 'sant', balance: 500000, snapshotDate: '2026-07-07' },
    fin: { accountId: 'fin', balance: 2000000, snapshotDate: '2026-07-07' },
  } } as any)
  vi.mocked(useSaveSnapshot).mockReturnValue({ mutate, isPending: false, isError: false } as any)
  mutate.mockReset()
})

describe('SnapshotsScreen', () => {
  it('should_ShowBothAccounts_When_Rendered', () => {
    render(<MemoryRouter><SnapshotsScreen /></MemoryRouter>)
    expect(screen.getByText('Santander Vista')).toBeInTheDocument()
    expect(screen.getByText('Fintual')).toBeInTheDocument()
  })
  it('should_SaveOnlyChangedAccounts_When_OneEdited', async () => {
    render(<MemoryRouter><SnapshotsScreen /></MemoryRouter>)
    await userEvent.click(screen.getByText('Santander Vista')) // selecciona el campo
    await userEvent.click(screen.getByRole('button', { name: '9' }))
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(mutate).toHaveBeenCalledWith(
      [expect.objectContaining({ accountId: 'sant' })],
      expect.anything(),
    )
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `npm test -- SnapshotsScreen`
Expected: FAIL (no existe la pantalla).

- [ ] **Step 4: Implementar** (`src/features/snapshots/SnapshotsScreen.tsx`)

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../../data/useAccounts'
import { useSaveSnapshot, useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import type { Account } from '../../data/types'

export function SnapshotsScreen() {
  const nav = useNavigate()
  const accounts = useAccounts()
  const latest = useLatestSnapshotsByAccount()
  const save = useSaveSnapshot()

  const relevant = (accounts.data ?? []).filter((a) => a.type === 'debit' || a.type === 'investment')
  const [active, setActive] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, number>>({})

  function currentValue(a: Account): number {
    return values[a.id] ?? latest.data?.[a.id]?.balance ?? 0
  }

  function save_() {
    const changed = Object.entries(values)
      .filter(([id, v]) => v !== (latest.data?.[id]?.balance ?? 0))
      .map(([accountId, balance]) => ({ accountId, balance }))
    if (changed.length === 0) return nav('/')
    save.mutate(changed, { onSuccess: () => nav('/') })
  }

  return (
    <section className="px-6 pt-8 flex flex-col min-h-[100dvh]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600 mb-4">snapshots de saldo</p>
      <div className="flex flex-col gap-3">
        {relevant.map((a) => (
          <button key={a.id} onClick={() => setActive(a.id)}
            className={`text-left p-4 rounded-xl border ${active === a.id ? 'border-accent' : 'border-ink-line'}`}>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-zinc-300">{a.name}</span>
              <MoneyText value={currentValue(a)} className="text-lg text-zinc-50" />
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-auto pt-6">
          <NumberPad value={values[active] ?? 0} onChange={(n) => setValues((v) => ({ ...v, [active]: n }))} />
        </div>
      )}

      {save.isError && <p className="text-debt text-sm mt-3">No se pudo guardar. Reintentá.</p>}
      <button onClick={save_} disabled={save.isPending}
        className="w-full mt-4 bg-accent text-accent-deep font-medium rounded-xl py-4 active:scale-[0.98] transition-transform disabled:opacity-40">
        {save.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </section>
  )
}
```

Ruta en `src/app/router.tsx` (agregar dentro del array):

```tsx
{ path: '/snapshots', element: <AppShell><SnapshotsScreen /></AppShell> },
```
(y `import { SnapshotsScreen } from '../features/snapshots/SnapshotsScreen'`)

- [ ] **Step 5: Verificar que pasa**

Run: `npx tsc --noEmit && npm test -- SnapshotsScreen`
Expected: sin errores; PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/features/snapshots src/app/router.tsx src/data/useSaveSnapshot.ts
git commit -m "feat: pantalla de snapshots de saldo"
```

---

### Task 5: Pantalla Ciclo — ciclo actual, mini-config y cerrar

**Files:**
- Create: `src/features/ciclo/CicloScreen.tsx`, `src/features/ciclo/BiceConfigSheet.tsx`, `src/features/ciclo/CloseCycleSheet.tsx`
- Modify: `src/app/router.tsx` (ruta `/ciclo`)
- Test: `src/features/ciclo/CicloScreen.test.tsx`

**Interfaces:**
- Consumes: `useCurrentCycleTransactions`, `useBiceConfig`, `useSaveBiceConfig`, `useCloseCycle`, `deriveCycleDates`, `useUnpaidCycles` (para Task 6), `NumberPad`, `BottomSheet`, `MoneyText`.
- Produces: `CicloScreen` con la sección "ciclo actual" + botones "Fechas BICE" y "Cerrar ciclo".

- [ ] **Step 1: BiceConfigSheet** (`src/features/ciclo/BiceConfigSheet.tsx`)

```tsx
import { useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { useSaveBiceConfig } from '../../data/useBiceConfig'
import type { BiceConfig } from '../../data/types'

interface Props { open: boolean; initial: BiceConfig | null; onClose: () => void }

export function BiceConfigSheet({ open, initial, onClose }: Props) {
  const save = useSaveBiceConfig()
  const [closingDay, setClosingDay] = useState(String(initial?.closingDay ?? ''))
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? ''))

  function clamp(s: string): number { return Math.min(28, Math.max(1, Number(s) || 1)) }
  function submit() {
    save.mutate({ closingDay: clamp(closingDay), dueDay: clamp(dueDay) }, { onSuccess: onClose })
  }

  return (
    <BottomSheet open={open} title="Fechas de BICE" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Día de corte (1–28)
          <input inputMode="numeric" value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent font-mono" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Día de vencimiento (1–28)
          <input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent font-mono" />
        </label>
        {save.isError && <p className="text-debt text-sm">No se pudo guardar.</p>}
        <button onClick={submit} disabled={save.isPending || !closingDay || !dueDay}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: CloseCycleSheet** (`src/features/ciclo/CloseCycleSheet.tsx`)

```tsx
import { useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { useCloseCycle } from '../../data/useCloseCycle'
import { deriveCycleDates } from '../../data/cycleDates'
import type { BiceConfig, CloseCycleResult } from '../../data/types'

interface Props {
  open: boolean
  config: BiceConfig
  onClose: () => void
  onClosed: (r: CloseCycleResult) => void
}

export function CloseCycleSheet({ open, config, onClose, onClosed }: Props) {
  const close = useCloseCycle()
  const [billed, setBilled] = useState(0)

  function submit() {
    const dates = deriveCycleDates(config, new Date())
    close.mutate({ billedAmount: billed, dates }, { onSuccess: (r) => { onClosed(r); onClose() } })
  }

  return (
    <BottomSheet open={open} title="Cerrar ciclo — monto de la boleta" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <MoneyText value={billed} className="text-3xl text-zinc-50" />
        <NumberPad value={billed} onChange={setBilled} />
        {close.isError && <p className="text-debt text-sm">No se pudo cerrar. Reintentá.</p>}
        <button onClick={submit} disabled={billed <= 0 || close.isPending}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {close.isPending ? 'Cerrando…' : 'Cerrar ciclo'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 3: Test que falla de CicloScreen** (`src/features/ciclo/CicloScreen.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CicloScreen } from './CicloScreen'

// Aislamos el hijo UnpaidCyclesSection para testear CicloScreen sola. Esto mantiene el test
// estable cuando Task 6 reemplaza el stub por la implementación real (que llama otros hooks).
vi.mock('./UnpaidCyclesSection', () => ({ UnpaidCyclesSection: () => null }))
vi.mock('../../data/useCurrentCycle')
vi.mock('../../data/useBiceConfig')
import { useCurrentCycleTransactions } from '../../data/useCurrentCycle'
import { useBiceConfig } from '../../data/useBiceConfig'

beforeEach(() => {
  vi.mocked(useCurrentCycleTransactions).mockReturnValue({
    data: { items: [
      { id: 't1', amount: 25000, description: 'Almuerzo', transactionDate: '2026-07-01', categoryName: 'Comida' },
      { id: 't2', amount: 15000, description: 'Uber', transactionDate: '2026-07-02', categoryName: 'Transporte' },
    ], total: 40000 }, isLoading: false, isError: false,
  } as any)
})

describe('CicloScreen', () => {
  it('should_ShowPartialSum_When_HasCurrentCycleTxs', () => {
    vi.mocked(useBiceConfig).mockReturnValue({ data: { closingDay: 25, dueDay: 15 }, isLoading: false } as any)
    render(<MemoryRouter><CicloScreen /></MemoryRouter>)
    expect(screen.getByText('$40.000')).toBeInTheDocument()
    expect(screen.getByText('Almuerzo')).toBeInTheDocument()
  })
  it('should_DisableCloseAndPromptConfig_When_NoBiceConfig', () => {
    vi.mocked(useBiceConfig).mockReturnValue({ data: null, isLoading: false } as any)
    render(<MemoryRouter><CicloScreen /></MemoryRouter>)
    expect(screen.getByText(/configurá las fechas/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 4: Verificar que falla**

Run: `npm test -- CicloScreen`
Expected: FAIL.

- [ ] **Step 5: Implementar CicloScreen** (`src/features/ciclo/CicloScreen.tsx`)

```tsx
import { useState } from 'react'
import { useCurrentCycleTransactions } from '../../data/useCurrentCycle'
import { useBiceConfig } from '../../data/useBiceConfig'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { BiceConfigSheet } from './BiceConfigSheet'
import { CloseCycleSheet } from './CloseCycleSheet'
import { UnpaidCyclesSection } from './UnpaidCyclesSection'
import type { CloseCycleResult } from '../../data/types'

export function CicloScreen() {
  const current = useCurrentCycleTransactions()
  const config = useBiceConfig()
  const [sheet, setSheet] = useState<null | 'config' | 'close'>(null)
  const [diff, setDiff] = useState<CloseCycleResult | null>(null)

  const hasConfig = !!config.data

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ciclo actual — sin facturar</p>

      {current.isLoading ? (
        <Skeleton className="h-8 w-40 mt-2" />
      ) : (
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-sm text-zinc-500">{current.data?.items.length ?? 0} gastos</span>
          <MoneyText value={current.data?.total ?? 0} className="text-2xl text-zinc-50" />
        </div>
      )}

      <div className="mt-4">
        {(current.data?.items ?? []).map((t) => (
          <div key={t.id} className="py-3 border-t border-ink-line flex justify-between items-center">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-zinc-200">{t.description ?? t.categoryName ?? 'Gasto'}</span>
              <span className="text-[11px] text-zinc-500">{t.categoryName ?? 'Sin categoría'}</span>
            </div>
            <MoneyText value={t.amount} className="text-sm text-zinc-300" />
          </div>
        ))}
        {current.data && current.data.items.length === 0 && (
          <p className="text-sm text-zinc-500 mt-2">Nada por facturar aún.</p>
        )}
      </div>

      {diff && diff.diferencia !== 0 && (
        <div className="mt-4 p-3 rounded-lg border border-[var(--fresh-warn)]/40">
          <p className="text-sm text-[var(--fresh-warn)]">
            Boleta <MoneyText value={diff.billedAmount} className="text-[var(--fresh-warn)]" /> vs registrado <MoneyText value={diff.sumaLedger} className="text-[var(--fresh-warn)]" /> → <MoneyText value={diff.diferencia} signed className="text-[var(--fresh-warn)]" /> sin identificar.
          </p>
        </div>
      )}

      {!hasConfig && !config.isLoading && (
        <p className="text-sm text-zinc-500 mt-4">Configurá las fechas de BICE para poder cerrar el ciclo.</p>
      )}

      <div className="flex gap-2 mt-5">
        <button onClick={() => setSheet('config')}
          className="border border-ink-line rounded-lg px-4 py-2.5 text-sm active:scale-[0.98]">Fechas BICE</button>
        <button onClick={() => setSheet(hasConfig ? 'close' : 'config')}
          className="flex-1 bg-accent text-accent-deep font-medium rounded-lg py-2.5 active:scale-[0.98] disabled:opacity-40">
          Cerrar ciclo
        </button>
      </div>

      <UnpaidCyclesSection />

      <BiceConfigSheet open={sheet === 'config'} initial={config.data ?? null} onClose={() => setSheet(null)} />
      {hasConfig && (
        <CloseCycleSheet open={sheet === 'close'} config={config.data!} onClose={() => setSheet(null)} onClosed={setDiff} />
      )}
    </section>
  )
}
```

> Nota: `UnpaidCyclesSection` se crea en Task 6. Para que este paso compile, crear un stub temporal `src/features/ciclo/UnpaidCyclesSection.tsx` con `export function UnpaidCyclesSection() { return null }` (se completa en Task 6).

Crear el stub:

```tsx
export function UnpaidCyclesSection() { return null }
```

Ruta en `src/app/router.tsx`:

```tsx
{ path: '/ciclo', element: <AppShell><CicloScreen /></AppShell> },
```
(y `import { CicloScreen } from '../features/ciclo/CicloScreen'`)

- [ ] **Step 6: Verificar que pasa**

Run: `npx tsc --noEmit && npm test -- CicloScreen`
Expected: sin errores; PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add src/features/ciclo src/app/router.tsx
git commit -m "feat: pantalla ciclo bice con actual, mini-config y cerrar"
```

---

### Task 6: Ciclos facturados pendientes + pagar + historial

**Files:**
- Create: `src/features/ciclo/PayCycleSheet.tsx`
- Modify: `src/features/ciclo/UnpaidCyclesSection.tsx` (reemplaza el stub)
- Test: `src/features/ciclo/UnpaidCyclesSection.test.tsx`

**Interfaces:**
- Consumes: `useUnpaidCycles`, `usePaidCycles`, `usePayCycle`, `useAccounts`, `useLatestSnapshotsByAccount`, `MoneyText`, `BottomSheet`, `NumberPad`.

- [ ] **Step 1: PayCycleSheet** (`src/features/ciclo/PayCycleSheet.tsx`)

```tsx
import { useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { usePayCycle } from '../../data/usePayCycle'
import type { BillingCycle } from '../../data/types'

interface Props {
  cycle: BillingCycle | null
  santanderAccountId: string | null
  lastSantanderBalance: number
  onClose: () => void
}

export function PayCycleSheet({ cycle, santanderAccountId, lastSantanderBalance, onClose }: Props) {
  const pay = usePayCycle()
  const proposed = Math.max(0, lastSantanderBalance - (cycle?.billedAmount ?? 0))
  const [saldo, setSaldo] = useState(proposed)

  function submit() {
    if (!cycle || !santanderAccountId) return
    pay.mutate(
      { cycleId: cycle.id, santanderAccountId, nuevoSaldo: saldo },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={!!cycle} title="Marcar pagada — nuevo saldo Santander" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-zinc-500">
          Propuesto: último saldo − boleta. El SLRD no cambia al pagar (esa deuda ya la debías).
        </p>
        <MoneyText value={saldo} className="text-3xl text-zinc-50" />
        <NumberPad value={saldo} onChange={setSaldo} />
        {pay.isError && <p className="text-debt text-sm">No se pudo registrar el pago. Reintentá.</p>}
        <button onClick={submit} disabled={pay.isPending || !santanderAccountId}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {pay.isPending ? 'Registrando…' : 'Confirmar pago'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Test que falla** (`src/features/ciclo/UnpaidCyclesSection.test.tsx`)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { UnpaidCyclesSection } from './UnpaidCyclesSection'

vi.mock('../../data/useUnpaidCycles')
vi.mock('../../data/useAccounts')
vi.mock('../../data/useSaveSnapshot')
import { useUnpaidCycles, usePaidCycles } from '../../data/useUnpaidCycles'
import { useAccounts } from '../../data/useAccounts'
import { useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'

beforeEach(() => {
  vi.mocked(useUnpaidCycles).mockReturnValue({ data: [
    { id: 'c1', cycleStart: '2026-06-01', cycleEnd: '2026-06-25', dueDate: '2026-07-15', billedAmount: 300000, isPaid: false },
  ], isLoading: false } as any)
  vi.mocked(usePaidCycles).mockReturnValue({ data: [], isLoading: false } as any)
  vi.mocked(useAccounts).mockReturnValue({ data: [{ id: 'sant', name: 'Santander Vista', type: 'debit', bank: 'Santander' }] } as any)
  vi.mocked(useLatestSnapshotsByAccount).mockReturnValue({ data: { sant: { accountId: 'sant', balance: 500000, snapshotDate: '2026-07-07' } } } as any)
})

describe('UnpaidCyclesSection', () => {
  it('should_ListUnpaidCycleWithAmountAndDue_When_Present', () => {
    render(<UnpaidCyclesSection />)
    expect(screen.getByText('$300.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /marcar pagada/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Verificar que falla**

Run: `npm test -- UnpaidCyclesSection`
Expected: FAIL (stub retorna null).

- [ ] **Step 4: Implementar** (`src/features/ciclo/UnpaidCyclesSection.tsx`)

```tsx
import { useState } from 'react'
import { useUnpaidCycles, usePaidCycles } from '../../data/useUnpaidCycles'
import { useAccounts } from '../../data/useAccounts'
import { useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'
import { MoneyText } from '../../components/ui/MoneyText'
import { PayCycleSheet } from './PayCycleSheet'
import type { BillingCycle } from '../../data/types'

export function UnpaidCyclesSection() {
  const unpaid = useUnpaidCycles()
  const paid = usePaidCycles()
  const accounts = useAccounts()
  const latest = useLatestSnapshotsByAccount()
  const [paying, setPaying] = useState<BillingCycle | null>(null)

  const santander = (accounts.data ?? []).find((a) => a.type === 'debit')
  const lastBalance = santander ? latest.data?.[santander.id]?.balance ?? 0 : 0

  return (
    <div className="mt-8">
      <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-1">facturado — pendiente de pago</p>
      {(unpaid.data ?? []).length === 0 && (
        <p className="text-sm text-zinc-500 mt-2">Sin ciclos pendientes.</p>
      )}
      {(unpaid.data ?? []).map((c) => (
        <div key={c.id} className="py-3.5 border-t border-ink-line flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <MoneyText value={c.billedAmount} className="text-[15px] text-zinc-100" />
            <span className="text-[11px] text-zinc-500">vence {c.dueDate}</span>
          </div>
          <button onClick={() => setPaying(c)}
            className="border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Marcar pagada</button>
        </div>
      ))}

      {(paid.data ?? []).length > 0 && (
        <details className="mt-6">
          <summary className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 cursor-pointer">pagados</summary>
          {(paid.data ?? []).map((c) => (
            <div key={c.id} className="py-3 border-t border-ink-line flex items-center justify-between">
              <span className="text-[11px] text-zinc-600">vencía {c.dueDate}</span>
              <MoneyText value={c.billedAmount} className="text-sm text-zinc-500" />
            </div>
          ))}
        </details>
      )}

      <PayCycleSheet
        cycle={paying}
        santanderAccountId={santander?.id ?? null}
        lastSantanderBalance={lastBalance}
        onClose={() => setPaying(null)}
      />
    </div>
  )
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx tsc --noEmit && npm test -- UnpaidCyclesSection`
Expected: sin errores; PASS (1 test).

- [ ] **Step 6: Commit**

```bash
git add src/features/ciclo/UnpaidCyclesSection.tsx src/features/ciclo/PayCycleSheet.tsx src/features/ciclo/UnpaidCyclesSection.test.tsx
git commit -m "feat: ciclos pendientes, pagar y historial"
```

---

### Task 7: Activar navegación Ciclo + verificación e2e + docs

**Files:**
- Modify: `src/app/AppShell.tsx` (tab Ciclo activo, link a `/ciclo`)
- Modify: `README.md`

**Interfaces:**
- Consumes: todo lo anterior.

- [ ] **Step 1: Activar el tab Ciclo** en `src/app/AppShell.tsx`

Reemplazar el `NavItem` de Ciclo deshabilitado por uno activo:

```tsx
<NavItem to="/ciclo" active={pathname === '/ciclo'} label="Ciclo" icon={<CalendarBlank size={22} />} />
```
(mantener los demás: Inicio activo, Historial/Ajustes atenuados.)

- [ ] **Step 2: Suite completa + build**

Run: `npm test`
Expected: todos PASS.
Run: `npx tsc --noEmit && npm run build`
Expected: sin errores; build ok.

- [ ] **Step 3: Verificación manual e2e** (controlador, en el navegador contra Supabase real)

1. Ir a Ciclo → configurar Fechas BICE (corte 25, vence 15) si no está.
2. Ver el ciclo actual con la suma de gastos sin facturar.
3. Cerrar ciclo con un `billed_amount` = suma → confirmar que el `slrd_inmediato` **no cambia** y los gastos pasan a facturados.
4. Marcar pagada con el saldo propuesto → confirmar que `slrd_inmediato` **sigue igual**, la deuda facturada desaparece y el snapshot de Santander bajó.

- [ ] **Step 4: Documentar en README** — agregar bajo "## App (Fase 1)" una nota de Fase 2:

```markdown
### Fase 2 — Ciclos
Pantalla Ciclo (tab inferior): configurar fechas de BICE, ver el ciclo actual, cerrar ciclo
(ingresando la boleta) y marcar pagada (baja el snapshot de Santander en el mismo paso).
Las mutaciones de ciclo son funciones RPC transaccionales en Postgres (`close_cycle`, `pay_cycle`).
```

- [ ] **Step 5: Commit**

```bash
git add src/app/AppShell.tsx README.md
git commit -m "feat: activa navegacion ciclo y documenta fase 2"
```

---

## Notas de implementación

- **Task 1 la ejecuta el controlador** vía el MCP de Supabase (apply_migration + tests SQL + regenerar `db.ts`); los subagentes de las tareas 2–7 no necesitan el MCP.
- **Derivación de fechas en el cliente** (no en la RPC): único lugar testeado (`deriveCycleDates`); `close_cycle` recibe las fechas ya calculadas y solo hace la mutación atómica. Refina el spec §4.2 (que las ubicaba en la RPC) sin cambiar el comportamiento ni la atomicidad.
- **Sin update optimista** en cerrar/pagar: el server devuelve el valor exacto; se invalida y refresca. Coherente con el spec §6.
- **`v_slrd` y RLS**: las RPC son `security invoker`, así que respetan la RLS existente; no hace falta tocar las vistas de Fase 0.
- **`accounts.type='debit'`** identifica Santander (única cuenta débito en v1); `pay_cycle` y la pantalla de snapshots dependen de esa suposición, documentada en el spec §4.3.
