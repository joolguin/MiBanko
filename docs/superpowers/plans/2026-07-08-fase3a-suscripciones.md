# Sub-fase 3a — Suscripciones fijas + cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-registrar gastos BICE desde suscripciones fijas mediante una RPC idempotente ejecutada por `pg_cron` (diario) y por la app al abrir, con una sección de gestión en un nuevo tab Ajustes.

**Architecture:** El cobro vive en una única RPC `run_due_subscriptions()` (`security definer`) que procesa todas las usuarias cuando la llama `pg_cron` (sin sesión) o solo la usuaria actual cuando la llama la app. La idempotencia la garantiza un índice único parcial sobre `transactions (subscription_id, mes)`. El frontend agrega hooks de React Query para el CRUD de suscripciones y una pantalla `/ajustes` con la sección Suscripciones.

**Tech Stack:** Supabase (Postgres + `pg_cron`), React + Vite + TypeScript, TanStack Query, Tailwind, Vitest + Testing Library. Migraciones y RPC se aplican al proyecto remoto `feljshqybemysbokqedp` vía el MCP de Supabase (`apply_migration` / `execute_sql`).

## Global Constraints

- **Sin `Co-Authored-By` ni trailers de co-autoría de IA en ningún commit.**
- `charge_day_of_month` restringido a **1–28** (el `check` ya existe en `fixed_subscriptions`).
- Ningún componente llama `supabase-js` directo — siempre vía hooks en `src/data/`.
- Tests de lógica pura en `.test.ts`; tests de componente en `.test.tsx`.
- `userEvent`: usar `const user = userEvent.setup()` + `await user.click(...)`.
- Estados obligatorios en toda pantalla: loading (skeleton), empty (texto tranquilo), error (inline + retry).
- Timezone del cobro: `America/Santiago`.
- Migración nueva: `supabase/migrations/0005_suscripciones_cron.sql`; aplicar el **mismo** SQL al remoto vía `apply_migration` con nombre `0005_suscripciones_cron`.

---

## File Structure

**SQL**
- Create `supabase/migrations/0005_suscripciones_cron.sql` — columna `subscription_id`, índice único de idempotencia, RPC `run_due_subscriptions()`, extensión + schedule de `pg_cron`.

**Data layer**
- Modify `src/data/types.ts` — interfaz `Subscription` + `SubscriptionInput`.
- Create `src/data/useSubscriptions.ts` — `mapSubscriptionRow`, `useSubscriptions`, `useSaveSubscription`, `useToggleSubscription`, `useDeleteSubscription`.
- Create `src/data/useRunDueSubscriptions.ts` — helpers de throttle + hook.

**UI**
- Create `src/features/ajustes/SubscriptionSheet.tsx` — `BottomSheet` de alta/edición.
- Create `src/features/ajustes/SubscriptionsSection.tsx` — lista + toggle/borrar + sheet.
- Create `src/features/ajustes/AjustesScreen.tsx` — pantalla contenedora.
- Create `src/app/SubscriptionCatchUp.tsx` — dispara la RPC al abrir la app.
- Modify `src/app/router.tsx` — ruta `/ajustes`.
- Modify `src/app/AppShell.tsx` — activa el tab Ajustes.
- Modify `src/App.tsx` — monta `<SubscriptionCatchUp />` bajo `RequireAuth`.

**Tests**
- Create `src/data/useSubscriptions.test.ts` — `mapSubscriptionRow`.
- Create `src/data/useRunDueSubscriptions.test.ts` — throttle.
- Create `src/features/ajustes/SubscriptionsSection.test.tsx` — lista/empty/borrar.
- Tests de la RPC: SQL vía MCP de Supabase (Tasks 1–3), no Vitest.

---

## Task 1: Columna de vínculo + índice de idempotencia

**Files:**
- Create: `supabase/migrations/0005_suscripciones_cron.sql`

**Interfaces:**
- Produces: columna `public.transactions.subscription_id uuid`; índice único parcial `uq_tx_subscription_month`.

- [ ] **Step 1: Crear el archivo de migración con la columna y el índice**

Escribir `supabase/migrations/0005_suscripciones_cron.sql`:

```sql
-- Sub-fase 3a: suscripciones fijas auto-registradas por cron.
-- fixed_subscriptions y su RLS ya existen desde 0001/0002; aquí solo el vínculo,
-- la idempotencia, la RPC de cobro y el schedule de pg_cron.

-- 1. Vínculo transacción -> suscripción (analítica + idempotencia).
alter table public.transactions
  add column if not exists subscription_id uuid
    references public.fixed_subscriptions(id) on delete set null;

-- 2. Un único cobro por suscripción por mes calendario.
create unique index if not exists uq_tx_subscription_month
  on public.transactions (subscription_id, (date_trunc('month', transaction_date::timestamp)))
  where subscription_id is not null;
```

- [ ] **Step 2: Aplicar la migración al proyecto remoto**

Vía el MCP de Supabase, `apply_migration` con `name: "0005_suscripciones_cron"` y el SQL del Step 1. (Este task aplica solo la parte de columna+índice; los Steps siguientes agregan RPC y cron al **mismo** archivo y se re-aplican como una migración incremental — ver Task 2/3. Alternativamente aplicar el archivo completo al final; pero para verificar por partes, aplicar ahora esta porción.)

- [ ] **Step 3: Verificar la columna y el índice**

Vía MCP `execute_sql`:

```sql
select column_name from information_schema.columns
where table_schema='public' and table_name='transactions' and column_name='subscription_id';
select indexname from pg_indexes
where schemaname='public' and tablename='transactions' and indexname='uq_tx_subscription_month';
```
Esperado: una fila `subscription_id` y una fila `uq_tx_subscription_month`.

- [ ] **Step 4: Verificar que el índice bloquea el duplicado mensual**

Vía MCP `execute_sql` (usa datos semilla existentes: una cuenta `credit` y una suscripción de la usuaria de prueba; si no hay, crearlos en una transacción de prueba y revertir). Ejemplo mínimo con rollback:

```sql
begin;
-- toma una suscripción y su usuaria de prueba
with s as (select id, user_id from public.fixed_subscriptions limit 1),
     a as (select id from public.accounts, s where accounts.user_id = s.user_id and accounts.type='credit' limit 1)
insert into public.transactions (user_id, account_id, type, amount, transaction_date, source, subscription_id)
select s.user_id, a.id, 'gasto', 1000, current_date, 'auto', s.id from s, a;
-- el segundo insert del mismo mes debe fallar por el índice único
with s as (select id, user_id from public.fixed_subscriptions limit 1),
     a as (select id from public.accounts, s where accounts.user_id = s.user_id and accounts.type='credit' limit 1)
insert into public.transactions (user_id, account_id, type, amount, transaction_date, source, subscription_id)
select s.user_id, a.id, 'gasto', 1000, current_date, 'auto', s.id from s, a;
rollback;
```
Esperado: el segundo `insert` lanza error `duplicate key value violates unique constraint "uq_tx_subscription_month"`. (Si no hay suscripción/cuenta credit semilla, este paso se cubre en Task 2 con datos creados ad-hoc; anotarlo y continuar.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_suscripciones_cron.sql
git commit -m "feat: columna subscription_id e indice de idempotencia mensual"
```

---

## Task 2: RPC `run_due_subscriptions()`

**Files:**
- Modify: `supabase/migrations/0005_suscripciones_cron.sql`

**Interfaces:**
- Consumes: `transactions.subscription_id`, índice `uq_tx_subscription_month` (Task 1).
- Produces: función `public.run_due_subscriptions() returns int`.

- [ ] **Step 1: Agregar la RPC al archivo de migración**

Añadir al final de `supabase/migrations/0005_suscripciones_cron.sql`:

```sql
-- 3. Cobro idempotente. Llamada por pg_cron (sin sesión -> todas las usuarias)
--    y por la app (con sesión -> solo la usuaria actual). Devuelve #cobros creados.
create or replace function public.run_due_subscriptions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_hoy    date := (now() at time zone 'America/Santiago')::date;
  v_dia    int  := extract(day from v_hoy)::int;
  v_bice   uuid;
  v_count  int  := 0;
  v_ins    int;
  sub      record;
begin
  for sub in
    select s.*
    from public.fixed_subscriptions s
    where s.is_active = true
      and s.charge_day_of_month = v_dia
      and (v_caller is null or s.user_id = v_caller)
  loop
    select a.id into v_bice
    from public.accounts a
    where a.user_id = sub.user_id and a.type = 'credit'
    limit 1;

    if v_bice is null then
      continue;
    end if;

    insert into public.transactions
      (user_id, account_id, type, amount, transaction_date, channel,
       category_id, description, source, billing_cycle_id, subscription_id)
    values
      (sub.user_id, v_bice, 'gasto', sub.amount, v_hoy, sub.channel,
       sub.category_id, sub.name, 'auto', null, sub.id)
    on conflict (subscription_id, (date_trunc('month', transaction_date::timestamp)))
    do nothing;

    get diagnostics v_ins = row_count;
    v_count := v_count + v_ins;
  end loop;

  return v_count;
end;
$$;

grant execute on function public.run_due_subscriptions() to authenticated;
```

- [ ] **Step 2: Aplicar al remoto**

Vía MCP `apply_migration` (nombre `0005_suscripciones_cron_rpc`, SQL del Step 1). `create or replace` es idempotente.

- [ ] **Step 3: Verificar cobro + idempotencia + is_active + día + scoping (SQL vía MCP)**

Vía MCP `execute_sql`, dentro de un bloque con `rollback` para no dejar datos de prueba. Prepara una usuaria de prueba con cuenta `credit` y suscripciones, simula sesión con `set_config('request.jwt.claims', ...)`, y comprueba:

```sql
begin;
-- usuaria de prueba y su cuenta credit
with u as (select user_id from public.accounts where type='credit' limit 1)
select set_config('request.jwt.claims',
  json_build_object('sub', (select user_id from u))::text, true);

-- suscripción que corresponde hoy
insert into public.fixed_subscriptions (name, amount, charge_day_of_month, channel, is_active)
values ('TEST-hoy', 5000, extract(day from (now() at time zone 'America/Santiago'))::int, 'wallet_pixel', true);
-- suscripción pausada que también sería hoy
insert into public.fixed_subscriptions (name, amount, charge_day_of_month, channel, is_active)
values ('TEST-pausada', 5000, extract(day from (now() at time zone 'America/Santiago'))::int, 'wallet_pixel', false);

select public.run_due_subscriptions() as primer_run;   -- espera 1 (solo la activa)
select public.run_due_subscriptions() as segundo_run;   -- espera 0 (idempotente)
select count(*) as cobros from public.transactions
  where source='auto' and description in ('TEST-hoy','TEST-pausada'); -- espera 1
rollback;
```
Esperado: `primer_run = 1`, `segundo_run = 0`, `cobros = 1` (la pausada no cobra).

- [ ] **Step 4: Verificar "día distinto no cobra" y "sin cuenta credit no falla" (SQL vía MCP)**

```sql
begin;
with u as (select user_id from public.accounts where type='credit' limit 1)
select set_config('request.jwt.claims', json_build_object('sub',(select user_id from u))::text, true);
-- día que NO es hoy (28 o 1 según corresponda para evitar coincidencia)
insert into public.fixed_subscriptions (name, amount, charge_day_of_month, channel, is_active)
values ('TEST-otrodia', 5000,
  case when extract(day from (now() at time zone 'America/Santiago'))::int = 1 then 2 else 1 end,
  'wallet_pixel', true);
select public.run_due_subscriptions() as run; -- espera 0
rollback;
```
Esperado: `run = 0`. (La rama "sin cuenta credit" se cubre por el `continue`: una usuaria sin cuenta credit simplemente no genera cobros y la función retorna sin error.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_suscripciones_cron.sql
git commit -m "feat: rpc run_due_subscriptions idempotente para cobro de suscripciones"
```

---

## Task 3: Schedule de `pg_cron`

**Files:**
- Modify: `supabase/migrations/0005_suscripciones_cron.sql`

**Interfaces:**
- Consumes: `run_due_subscriptions()` (Task 2).
- Produces: job `run-due-subscriptions` en `cron.job`.

- [ ] **Step 1: Agregar extensión y schedule al archivo de migración**

Añadir al final de `supabase/migrations/0005_suscripciones_cron.sql`:

```sql
-- 4. Cron diario. 09:00 UTC ya es el nuevo día en Santiago (UTC-3/-4).
create extension if not exists pg_cron;

-- idempotente: desprograma un job previo con el mismo nombre antes de crearlo.
select cron.unschedule(jobid) from cron.job where jobname = 'run-due-subscriptions';
select cron.schedule('run-due-subscriptions', '0 9 * * *',
  $$select public.run_due_subscriptions();$$);
```

- [ ] **Step 2: Aplicar al remoto**

Vía MCP `apply_migration` (nombre `0005_suscripciones_cron_schedule`, SQL del Step 1).

- [ ] **Step 3: Verificar que el job existe**

Vía MCP `execute_sql`:

```sql
select jobname, schedule, command from cron.job where jobname = 'run-due-subscriptions';
```
Esperado: una fila con `schedule = '0 9 * * *'` y el command llamando `run_due_subscriptions`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0005_suscripciones_cron.sql
git commit -m "feat: schedule diario de pg_cron para run_due_subscriptions"
```

---

## Task 4: Tipos + hooks de suscripciones

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/useSubscriptions.ts`
- Test: `src/data/useSubscriptions.test.ts`

**Interfaces:**
- Produces:
  - `Subscription { id, name, amount, chargeDayOfMonth, categoryId, channel, isActive }`
  - `SubscriptionInput { id?, name, amount, chargeDayOfMonth, categoryId, channel }`
  - `mapSubscriptionRow(row) => Subscription`
  - `useSubscriptions()`, `useSaveSubscription()`, `useToggleSubscription()`, `useDeleteSubscription()`

- [ ] **Step 1: Agregar los tipos a `types.ts`**

Añadir a `src/data/types.ts` (después de `Category`):

```ts
export interface Subscription {
  id: string
  name: string
  amount: number
  chargeDayOfMonth: number
  categoryId: string | null
  channel: Channel
  isActive: boolean
}

export interface SubscriptionInput {
  id?: string
  name: string
  amount: number
  chargeDayOfMonth: number
  categoryId: string | null
  channel: Channel
}
```

- [ ] **Step 2: Escribir el test de `mapSubscriptionRow`**

Crear `src/data/useSubscriptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapSubscriptionRow } from './useSubscriptions'

describe('mapSubscriptionRow', () => {
  it('should_MapSnakeToCamel_When_FullRow', () => {
    const r = mapSubscriptionRow({
      id: 's1', name: 'Spotify', amount: 5900, charge_day_of_month: 5,
      category_id: 'cat1', channel: 'wallet_pixel', is_active: true,
    })
    expect(r).toEqual({
      id: 's1', name: 'Spotify', amount: 5900, chargeDayOfMonth: 5,
      categoryId: 'cat1', channel: 'wallet_pixel', isActive: true,
    })
  })
  it('should_NullCategory_When_Absent', () => {
    const r = mapSubscriptionRow({
      id: 's2', name: 'Gym', amount: 30000, charge_day_of_month: 1,
      category_id: null, channel: 'otro', is_active: false,
    })
    expect(r.categoryId).toBeNull()
    expect(r.isActive).toBe(false)
  })
})
```

- [ ] **Step 3: Correr el test — debe fallar**

Run: `npx vitest run src/data/useSubscriptions.test.ts`
Expected: FAIL (`mapSubscriptionRow` no existe).

- [ ] **Step 4: Implementar `useSubscriptions.ts`**

Crear `src/data/useSubscriptions.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Channel, Subscription, SubscriptionInput } from './types'

export function mapSubscriptionRow(row: Record<string, string | number | boolean | null>): Subscription {
  return {
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount ?? 0),
    chargeDayOfMonth: Number(row.charge_day_of_month ?? 1),
    categoryId: row.category_id ? String(row.category_id) : null,
    channel: String(row.channel) as Channel,
    isActive: Boolean(row.is_active),
  }
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async (): Promise<Subscription[]> => {
      const { data, error } = await supabase
        .from('fixed_subscriptions')
        .select('id, name, amount, charge_day_of_month, category_id, channel, is_active')
        .order('charge_day_of_month')
      if (error) throw error
      return (data as Record<string, string | number | boolean | null>[]).map(mapSubscriptionRow)
    },
  })
}

export function useSaveSubscription() {
  const qc = useQueryClient()
  return useMutation<void, Error, SubscriptionInput>({
    mutationFn: async (s) => {
      const row = {
        ...(s.id ? { id: s.id } : {}),
        name: s.name,
        amount: s.amount,
        charge_day_of_month: s.chargeDayOfMonth,
        category_id: s.categoryId,
        channel: s.channel,
      }
      const { error } = await supabase.from('fixed_subscriptions').upsert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })
}

export function useToggleSubscription() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await supabase.from('fixed_subscriptions').update({ is_active: isActive }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })
}

export function useDeleteSubscription() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('fixed_subscriptions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })
}
```

- [ ] **Step 5: Correr el test — debe pasar**

Run: `npx vitest run src/data/useSubscriptions.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/useSubscriptions.ts src/data/useSubscriptions.test.ts
git commit -m "feat: tipos y hooks de suscripciones (lista, upsert, toggle, borrar)"
```

---

## Task 5: Hook de red de seguridad `useRunDueSubscriptions`

**Files:**
- Create: `src/data/useRunDueSubscriptions.ts`
- Test: `src/data/useRunDueSubscriptions.test.ts`

**Interfaces:**
- Produces: `todayKey(now)`, `shouldRun(storage, now)`, `markRan(storage, now)`, `useRunDueSubscriptions()`.

- [ ] **Step 1: Escribir el test del throttle**

Crear `src/data/useRunDueSubscriptions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { todayKey, shouldRun, markRan } from './useRunDueSubscriptions'

function memStorage(initial: Record<string, string> = {}) {
  const m = { ...initial }
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = v },
    _map: m,
  }
}

describe('throttle de run_due_subscriptions', () => {
  const now = new Date('2026-07-08T12:00:00Z')

  it('should_RunTrue_When_NuncaCorrioHoy', () => {
    expect(shouldRun(memStorage(), now)).toBe(true)
  })
  it('should_RunFalse_When_YaCorrioHoy', () => {
    const s = memStorage()
    markRan(s, now)
    expect(shouldRun(s, now)).toBe(false)
  })
  it('should_RunTrue_When_CorrioOtroDia', () => {
    const s = memStorage({ 'mibanko:subs-run': todayKey(new Date('2026-07-07T12:00:00Z')) })
    expect(shouldRun(s, now)).toBe(true)
  })
})
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npx vitest run src/data/useRunDueSubscriptions.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar `useRunDueSubscriptions.ts`**

Crear `src/data/useRunDueSubscriptions.ts`:

```ts
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const KEY = 'mibanko:subs-run'

export function todayKey(now: Date): string {
  return now.toISOString().slice(0, 10)
}

export function shouldRun(storage: Pick<Storage, 'getItem'>, now: Date): boolean {
  return storage.getItem(KEY) !== todayKey(now)
}

export function markRan(storage: Pick<Storage, 'setItem'>, now: Date): void {
  storage.setItem(KEY, todayKey(now))
}

export function useRunDueSubscriptions(): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const now = new Date()
    if (!shouldRun(window.localStorage, now)) return
    markRan(window.localStorage, now) // marca antes: evita doble disparo (StrictMode)
    supabase.rpc('run_due_subscriptions').then(({ error }) => {
      if (error) return
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['current-cycle'] })
    })
  }, [qc])
}
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx vitest run src/data/useRunDueSubscriptions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/useRunDueSubscriptions.ts src/data/useRunDueSubscriptions.test.ts
git commit -m "feat: hook useRunDueSubscriptions con throttle diario"
```

---

## Task 6: `SubscriptionSheet` (alta/edición)

**Files:**
- Create: `src/features/ajustes/SubscriptionSheet.tsx`

**Interfaces:**
- Consumes: `useSaveSubscription` (Task 4), `useCategories`, `Chip`, `NumberPad`, `BottomSheet`, `MoneyText`, tipos `Subscription`/`Channel`.
- Produces: `SubscriptionSheet({ open, initial, onClose })` — `initial: Subscription | null`.

- [ ] **Step 1: Implementar el sheet**

Crear `src/features/ajustes/SubscriptionSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { Chip } from '../../components/ui/Chip'
import { useSaveSubscription } from '../../data/useSubscriptions'
import { useCategories } from '../../data/useCategories'
import type { Channel, Subscription } from '../../data/types'

const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'wallet_pixel', label: 'Wallet Pixel' },
  { id: 'tarjeta_fisica', label: 'Tarjeta física' },
  { id: 'onepay', label: 'Onepay' },
  { id: 'transferencia_app', label: 'Transferencia' },
  { id: 'otro', label: 'Otro' },
]

interface Props { open: boolean; initial: Subscription | null; onClose: () => void }

export function SubscriptionSheet({ open, initial, onClose }: Props) {
  const save = useSaveSubscription()
  const categories = useCategories()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [day, setDay] = useState('1')
  const [channel, setChannel] = useState<Channel>('wallet_pixel')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setAmount(initial?.amount ?? 0)
    setDay(String(initial?.chargeDayOfMonth ?? 1))
    setChannel(initial?.channel ?? 'wallet_pixel')
    setCategoryId(initial?.categoryId ?? null)
  }, [open, initial])

  function clampDay(s: string): number { return Math.min(28, Math.max(1, Number(s) || 1)) }
  const canSave = name.trim().length > 0 && amount > 0 && !save.isPending

  function submit() {
    save.mutate(
      {
        ...(initial ? { id: initial.id } : {}),
        name: name.trim(), amount, chargeDayOfMonth: clampDay(day),
        categoryId, channel,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={open} title={initial ? 'Editar suscripción' : 'Nueva suscripción'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Spotify)"
          className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />

        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-1">monto</p>
          <MoneyText value={amount} className="text-3xl text-zinc-50" />
        </div>

        <label className="flex items-center justify-between text-sm text-zinc-400">
          Día de cobro (1–28)
          <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)}
            className="w-20 bg-ink-2 border border-ink-line rounded-lg px-3 py-2 outline-none focus:border-accent font-mono text-right" />
        </label>

        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Chip key={c.id} label={c.label} active={channel === c.id} onClick={() => setChannel(c.id)} />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip label="Sin categoría" active={categoryId === null} onClick={() => setCategoryId(null)} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
          ))}
        </div>

        <NumberPad value={amount} onChange={setAmount} />

        {save.isError && <p className="text-debt text-sm">No se pudo guardar. Reintentá.</p>}
        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/features/ajustes/SubscriptionSheet.tsx
git commit -m "feat: sheet de alta y edicion de suscripciones"
```

---

## Task 7: `SubscriptionsSection` (lista + acciones)

**Files:**
- Create: `src/features/ajustes/SubscriptionsSection.tsx`
- Test: `src/features/ajustes/SubscriptionsSection.test.tsx`

**Interfaces:**
- Consumes: `useSubscriptions`, `useToggleSubscription`, `useDeleteSubscription` (Task 4), `SubscriptionSheet` (Task 6), `MoneyText`, `Skeleton`.
- Produces: `SubscriptionsSection()`.

- [ ] **Step 1: Escribir el test de la lista**

Crear `src/features/ajustes/SubscriptionsSection.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscriptionsSection } from './SubscriptionsSection'

vi.mock('../../data/useSubscriptions')
vi.mock('../../data/useCategories')
import {
  useSubscriptions, useToggleSubscription, useDeleteSubscription, useSaveSubscription,
} from '../../data/useSubscriptions'
import { useCategories } from '../../data/useCategories'

const del = vi.fn()
const toggle = vi.fn()
beforeEach(() => {
  del.mockReset(); toggle.mockReset()
  vi.mocked(useSubscriptions).mockReturnValue({ data: [
    { id: 's1', name: 'Spotify', amount: 5900, chargeDayOfMonth: 5, categoryId: null, channel: 'wallet_pixel', isActive: true },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useToggleSubscription).mockReturnValue({ mutate: toggle } as any)
  vi.mocked(useDeleteSubscription).mockReturnValue({ mutate: del } as any)
  vi.mocked(useSaveSubscription).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
  vi.mocked(useCategories).mockReturnValue({ data: [] } as any)
})

describe('SubscriptionsSection', () => {
  it('should_ListSubscription_When_Present', () => {
    render(<SubscriptionsSection />)
    expect(screen.getByText('Spotify')).toBeInTheDocument()
    expect(screen.getByText('$5.900')).toBeInTheDocument()
    expect(screen.getByText(/día 5/i)).toBeInTheDocument()
  })
  it('should_CallDelete_When_BorrarClicked', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsSection />)
    await user.click(screen.getByRole('button', { name: /borrar spotify/i }))
    expect(del).toHaveBeenCalledWith('s1')
  })
  it('should_ShowEmpty_When_NoSubscriptions', () => {
    vi.mocked(useSubscriptions).mockReturnValue({ data: [], isLoading: false, isError: false } as any)
    render(<SubscriptionsSection />)
    expect(screen.getByText(/no tenés suscripciones/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test — debe fallar**

Run: `npx vitest run src/features/ajustes/SubscriptionsSection.test.tsx`
Expected: FAIL (componente no existe).

- [ ] **Step 3: Implementar `SubscriptionsSection.tsx`**

Crear `src/features/ajustes/SubscriptionsSection.tsx`:

```tsx
import { useState } from 'react'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { Plus, Trash } from '@phosphor-icons/react'
import {
  useSubscriptions, useToggleSubscription, useDeleteSubscription,
} from '../../data/useSubscriptions'
import { SubscriptionSheet } from './SubscriptionSheet'
import type { Subscription } from '../../data/types'

export function SubscriptionsSection() {
  const subs = useSubscriptions()
  const toggle = useToggleSubscription()
  const del = useDeleteSubscription()
  const [editing, setEditing] = useState<Subscription | null | 'new'>(null)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">suscripciones fijas</p>
        <button onClick={() => setEditing('new')} aria-label="Agregar suscripción"
          className="flex items-center gap-1 text-sm text-accent-bright active:scale-[0.98]">
          <Plus size={16} weight="bold" /> Agregar
        </button>
      </div>

      {subs.isLoading && <Skeleton className="h-16 w-full mt-3" />}

      {subs.isError && (
        <div className="mt-3">
          <p className="text-debt text-sm">No se pudieron cargar. Reintentá.</p>
          <button onClick={() => subs.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Reintentar</button>
        </div>
      )}

      {subs.data && subs.data.length === 0 && (
        <p className="text-sm text-zinc-500 mt-3">No tenés suscripciones. Agregá la primera.</p>
      )}

      <div className="mt-2">
        {(subs.data ?? []).map((s) => (
          <div key={s.id} className={`py-3 border-t border-ink-line flex items-center justify-between ${s.isActive ? '' : 'opacity-45'}`}>
            <button onClick={() => setEditing(s)} className="text-left flex flex-col gap-0.5">
              <span className="text-sm text-zinc-200">{s.name}</span>
              <span className="text-[11px] text-zinc-500">día {s.chargeDayOfMonth}{s.isActive ? '' : ' · pausada'}</span>
            </button>
            <div className="flex items-center gap-3">
              <MoneyText value={s.amount} className="text-sm text-zinc-300" />
              <button onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}
                className="text-[11px] text-zinc-400 border border-ink-line rounded-full px-2.5 py-1 active:scale-[0.98]">
                {s.isActive ? 'Pausar' : 'Activar'}
              </button>
              <button onClick={() => del.mutate(s.id)} aria-label={`Borrar ${s.name}`}
                className="text-zinc-500 active:scale-[0.9]">
                <Trash size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <SubscriptionSheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}
```

- [ ] **Step 4: Correr el test — debe pasar**

Run: `npx vitest run src/features/ajustes/SubscriptionsSection.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/ajustes/SubscriptionsSection.tsx src/features/ajustes/SubscriptionsSection.test.tsx
git commit -m "feat: seccion de suscripciones con lista, pausar y borrar"
```

---

## Task 8: Pantalla `/ajustes` + tab + catch-up

**Files:**
- Create: `src/features/ajustes/AjustesScreen.tsx`
- Create: `src/app/SubscriptionCatchUp.tsx`
- Modify: `src/app/router.tsx`
- Modify: `src/app/AppShell.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `SubscriptionsSection` (Task 7), `useRunDueSubscriptions` (Task 5), `AppShell`.
- Produces: ruta `/ajustes`; tab Ajustes activo; `<SubscriptionCatchUp />` montado bajo `RequireAuth`.

- [ ] **Step 1: Implementar `AjustesScreen.tsx`**

Crear `src/features/ajustes/AjustesScreen.tsx`:

```tsx
import { SubscriptionsSection } from './SubscriptionsSection'

export function AjustesScreen() {
  return (
    <section className="px-6 pt-8 flex flex-col gap-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ajustes</p>
      <SubscriptionsSection />
    </section>
  )
}
```

- [ ] **Step 2: Implementar `SubscriptionCatchUp.tsx`**

Crear `src/app/SubscriptionCatchUp.tsx`:

```tsx
import { useRunDueSubscriptions } from '../data/useRunDueSubscriptions'

export function SubscriptionCatchUp() {
  useRunDueSubscriptions()
  return null
}
```

- [ ] **Step 3: Agregar la ruta `/ajustes`**

Modificar `src/app/router.tsx`: importar `AjustesScreen` y agregar la ruta:

```tsx
import { AjustesScreen } from '../features/ajustes/AjustesScreen'
```
```tsx
  { path: '/ajustes', element: <AppShell><AjustesScreen /></AppShell> },
```
(agregar dentro del array, después de la ruta `/ciclo`).

- [ ] **Step 4: Activar el tab Ajustes**

Modificar `src/app/AppShell.tsx`. Reemplazar la línea del tab Ajustes deshabilitado:

```tsx
        <NavItem disabled label="Historial" icon={<ChartLine size={22} />} />
        <NavItem disabled label="Ajustes" icon={<GearSix size={22} />} />
```
por:

```tsx
        <NavItem disabled label="Historial" icon={<ChartLine size={22} />} />
        <NavItem to="/ajustes" active={pathname === '/ajustes'} label="Ajustes" icon={<GearSix size={22} />} />
```

- [ ] **Step 5: Montar el catch-up bajo `RequireAuth`**

Modificar `src/App.tsx`:

```tsx
import { RouterProvider } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { SubscriptionCatchUp } from './app/SubscriptionCatchUp'
import { router } from './app/router'

export default function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <SubscriptionCatchUp />
        <RouterProvider router={router} />
      </RequireAuth>
    </AuthProvider>
  )
}
```

- [ ] **Step 6: Typecheck + suite completa**

Run: `npx tsc --noEmit && npx vitest run`
Expected: sin errores de tipos; toda la suite en verde (los tests previos + los nuevos).

- [ ] **Step 7: Commit**

```bash
git add src/features/ajustes/AjustesScreen.tsx src/app/SubscriptionCatchUp.tsx src/app/router.tsx src/app/AppShell.tsx src/App.tsx
git commit -m "feat: pantalla ajustes con tab activo y catch-up de suscripciones al abrir"
```

---

## Task 9: Verificación end-to-end + documentación

**Files:**
- Modify: `docs/plan-slrd.md` (marcar avance de Fase 3a, opcional)

- [ ] **Step 1: Suite completa + typecheck**

Run: `npx tsc --noEmit && npx vitest run`
Expected: todo verde.

- [ ] **Step 2: Verificación manual contra Supabase real (navegador)**

`npm run dev`, login, ir a Ajustes → crear una suscripción con `día de cobro = hoy` → recargar la app (dispara `run_due_subscriptions`) → verificar en Ciclo que aparece el gasto `auto` y que el SLRD del dashboard bajó por el monto. Recargar de nuevo el mismo día → sin cambios (idempotente).

- [ ] **Step 3 (opcional): Actualizar `docs/plan-slrd.md`**

Anotar en la tabla de fases que Fase 3 arranca con la sub-fase 3a (suscripciones + cron) completada. Commit:

```bash
git add docs/plan-slrd.md
git commit -m "docs: marca sub-fase 3a completada"
```

- [ ] **Step 4: Cierre de rama**

Usar la skill `superpowers:finishing-a-development-branch` para verificar tests, presentar opciones y (si se elige) mergear `feat/fase3a-suscripciones` a `main`.

---

## Notas de implementación

- **Aplicar SQL al remoto:** la migración `0005` se construye en tres pasos (Tasks 1–3) y se aplica incrementalmente vía `apply_migration`. El archivo `.sql` en git es la fuente de verdad; contiene el SQL completo al terminar Task 3.
- **`security definer`:** `run_due_subscriptions` corre como el owner (postgres), por eso puede insertar en `transactions` desde el cron sin sesión. Siempre inserta con el `user_id` de la suscripción; cuando la llama una usuaria autenticada, se restringe a `auth.uid()`. `set search_path = public` evita secuestro de search_path.
- **Idempotencia:** el `on conflict ... do nothing` + índice único parcial garantiza un cobro por suscripción por mes, aunque la RPC se llame N veces (cron + app + StrictMode).
- **Throttle de la app:** `localStorage` por dispositivo. Abrir en dos dispositivos el mismo día llama dos veces; inofensivo por la idempotencia.
