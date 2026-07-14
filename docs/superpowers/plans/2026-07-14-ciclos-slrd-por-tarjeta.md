# Ciclos y SLRD por tarjeta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cada tarjeta de crédito tenga su propio ciclo de facturación (total sin facturar, cierre que factura solo sus gastos, y pago), con `CicloScreen` mostrando una sección apilada por tarjeta. El SLRD sigue siendo el número agregado.

**Architecture:** Server-side: `bice_billing_cycles` → `billing_cycles` con `account_id`; `close_cycle` gana `p_account_id` y estampa solo los gastos de esa tarjeta; `pay_cycle`/`v_slrd` solo actualizan la referencia de tabla. Cliente: `useOpenCycle(accountId)` (keyeado `['current-cycle', accountId]` para preservar las invalidaciones existentes), `useCloseCycle` con `accountId`, `BillingCycle` gana `accountId`. UI: `CicloScreen` itera las tarjetas de crédito renderizando un `CardCycleBlock` por cada una.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, Supabase (Postgres RPC + vista + RLS), Vitest + Testing Library.

## Global Constraints

- **Depende de A y B mergeados** (existen `card_billing_config`, `useCardBillingConfig`, `CardCycleSheet`, `AccountsSection`; `CicloScreen` hoy usa el transitorio `usePrimaryCardConfig` de B).
- **SLRD agregado, sin cambio de lógica:** `v_slrd` solo cambia la referencia de tabla. `slrdDelta`, `cycleDates`/`deriveCycleDates` **no cambian**.
- **Cierre por tarjeta:** `close_cycle` estampa `billing_cycle_id` solo donde `account_id = p_account_id AND billing_cycle_id IS NULL AND type='gasto'`; guarda `account_id` en el ciclo.
- **Backfill:** ciclos existentes → tarjeta BICE principal (única `type='credit'`).
- **queryKey del ciclo abierto:** `['current-cycle', accountId]`. Debe seguir el prefijo `['current-cycle']` para que las invalidaciones existentes (registro/import/cierre de tx — contrato de memoria del proyecto) lo alcancen.
- **Se elimina `usePrimaryCardConfig`** (transitorio de B).
- **Migraciones:** las corre el **controller** (gate humano + MCP Supabase). Para modificar un RPC/vista existente: obtener su definición actual con `pg_get_functiondef`/`pg_get_viewdef` (MCP `execute_sql`) y aplicar los cambios puntuales indicados — no reescribir a ciegas. Tras cada migración, regenerar `src/types/db.ts`.
- **Commits:** Conventional Commits, español, trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Estándares:** clean-code-standards (SRP datos/UI, funciones puras, nombres reveladores).

## File Structure

- **DB:** `bice_billing_cycles` → `billing_cycles` (+ `account_id`); RPCs `close_cycle`/`pay_cycle`; vista `v_slrd`.
- `src/data/types.ts` (modificar) — `BillingCycle` gana `accountId`.
- `src/data/useCurrentCycle.ts` (modificar) — `useOpenCycle(accountId)`.
- `src/data/useUnpaidCycles.ts` (modificar) — `mapCycleRow` mapea `accountId`; selects traen `account_id`.
- `src/data/useCloseCycle.ts` (modificar) — payload gana `accountId`.
- `src/data/useCardBillingConfig.ts` (modificar) — eliminar `usePrimaryCardConfig`.
- `src/features/ciclo/CloseCycleSheet.tsx` (modificar) — prop `accountId`.
- `src/features/ciclo/CardCycleBlock.tsx` (crear) — bloque por tarjeta.
- `src/features/ciclo/CicloScreen.tsx` (modificar) — itera tarjetas.
- `src/features/ciclo/UnpaidCyclesSection.tsx` (modificar) — nombre de tarjeta por ciclo.
- Tests: `useUnpaidCycles.test.ts`, `CicloScreen.test.tsx`, `UnpaidCyclesSection.test.tsx` (actualizar).

---

### Task 1: Migración — `billing_cycles` con `account_id` + backfill (controller-run)

**Files:** DB + `src/types/db.ts`.

- [ ] **Step 1: Renombrar, agregar `account_id`, backfill** (MCP `apply_migration`)

```sql
alter table bice_billing_cycles rename to billing_cycles;
alter table billing_cycles add column account_id uuid references accounts(id);

update billing_cycles bc
set account_id = (select a.id from accounts a where a.type = 'credit' limit 1);

alter table billing_cycles alter column account_id set not null;
```

- [ ] **Step 2: Repuntar `pay_cycle` y `v_slrd` al nuevo nombre** (MCP `execute_sql`)

Obtener las definiciones actuales:
```sql
select pg_get_functiondef('pay_cycle'::regprocedure);
select pg_get_viewdef('v_slrd', true);
```
Recrear cada una **idéntica salvo** reemplazar toda referencia `bice_billing_cycles` por `billing_cycles` (`create or replace function pay_cycle ...`, `create or replace view v_slrd ...`). No cambiar ninguna otra lógica.

- [ ] **Step 3: Verificar** (MCP `execute_sql`)

```sql
select count(*) from billing_cycles where account_id is null;  -- esperado: 0
```

- [ ] **Step 4: Regenerar tipos + build** (MCP `generate_typescript_types`)

Regenerar `src/types/db.ts`. Run: `npm run build` → OK. Los hooks que aún dicen `bice_billing_cycles` (`useUnpaidCycles`) **romperán el tipo** — se arreglan en Task 3; por eso este commit puede dejar el build rojo momentáneamente. **Para no romper el build**, en este mismo paso hacer el reemplazo mecánico `bice_billing_cycles` → `billing_cycles` en `src/data/useUnpaidCycles.ts` (dos `.from('bice_billing_cycles')`).

- [ ] **Step 5: Commit**

```bash
git add src/types/db.ts src/data/useUnpaidCycles.ts
git commit -m "feat(ciclos): billing_cycles con account_id + backfill a tarjeta principal

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migración — `close_cycle` por tarjeta (controller-run)

**Files:** DB + `src/types/db.ts`.

- [ ] **Step 1: Obtener la definición actual** (MCP `execute_sql`)

```sql
select pg_get_functiondef('close_cycle'::regprocedure);
```

- [ ] **Step 2: Recrear `close_cycle` con `p_account_id`** (MCP `apply_migration`)

`create or replace function close_cycle(...)` con estos cambios puntuales sobre la definición actual:
1. Agregar el parámetro `p_account_id uuid` a la firma.
2. En el `insert into billing_cycles (...)`, incluir la columna `account_id` con valor `p_account_id`.
3. En el `update transactions set billing_cycle_id = <nuevo ciclo>` que estampa los gastos, agregar al `where` la condición `and account_id = p_account_id` (además del `billing_cycle_id is null and type = 'gasto'` que ya tiene).
4. `suma_ledger` debe sumar solo esos gastos (los de `p_account_id`); si hoy suma "todos los abiertos", agregar el mismo filtro `account_id = p_account_id`.
Ninguna otra lógica cambia.

- [ ] **Step 3: Regenerar tipos + build** (MCP `generate_typescript_types`)

Regenerar `src/types/db.ts` (la firma del RPC cambió). Run: `npm run build`. `useCloseCycle` todavía llama sin `p_account_id` — se ajusta en Task 3; para no romper el build de tipos del RPC, Task 3 va inmediatamente después. Si el tipo del RPC exige el arg nuevo, dejar este build para el final de Task 3.

- [ ] **Step 4: Commit**

```bash
git add src/types/db.ts
git commit -m "feat(ciclos): close_cycle estampa solo los gastos de la tarjeta (p_account_id)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Capa de datos — `accountId` en tipos, hooks y ciclo abierto por tarjeta

**Files:**
- Modify: `src/data/types.ts`, `src/data/useCurrentCycle.ts`, `src/data/useUnpaidCycles.ts`, `src/data/useUnpaidCycles.test.ts`, `src/data/useCloseCycle.ts`, `src/data/useCardBillingConfig.ts`

**Interfaces:**
- Produces:
  - `BillingCycle` gana `accountId: string`.
  - `useOpenCycle(accountId: string): UseQueryResult<{ items: CycleTx[]; total: number }>` — `queryKey: ['current-cycle', accountId]`.
  - `useCloseCycle` payload: `{ accountId: string; billedAmount: number; dates: CycleDates }`.
  - `usePrimaryCardConfig` **eliminado**.

- [ ] **Step 1: TDD de `mapCycleRow` con `accountId`**

En `src/data/useUnpaidCycles.test.ts`, extender el test existente para incluir `account_id`:

```ts
const row = {
  id: 'c1', cycle_start: '2026-05-26', cycle_end: '2026-06-25',
  due_date: '2026-07-15', billed_amount: '300000', is_paid: false, account_id: 'a1',
}
expect(mapCycleRow(row)).toEqual({
  id: 'c1', cycleStart: '2026-05-26', cycleEnd: '2026-06-25',
  dueDate: '2026-07-15', billedAmount: 300000, isPaid: false, accountId: 'a1',
})
```

Run: `npx vitest run src/data/useUnpaidCycles.test.ts` → FAIL (falta `accountId`).

- [ ] **Step 2: `BillingCycle` + `mapCycleRow` + selects**

En `src/data/types.ts`, agregar `accountId: string` a `BillingCycle` (después de `id`).

En `src/data/useUnpaidCycles.ts`: en `mapCycleRow` agregar `accountId: String(row.account_id)`, y en ambos `.select(...)` agregar `account_id`.

Run: `npx vitest run src/data/useUnpaidCycles.test.ts` → PASS.

- [ ] **Step 3: `useOpenCycle(accountId)`**

En `src/data/useCurrentCycle.ts`, reemplazar `useCurrentCycleTransactions` por:

```ts
export function useOpenCycle(accountId: string) {
  return useQuery({
    queryKey: ['current-cycle', accountId],
    queryFn: async (): Promise<{ items: CycleTx[]; total: number }> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, description, transaction_date, categories(name), accounts!inner(type)')
        .eq('type', 'gasto')
        .is('billing_cycle_id', null)
        .eq('account_id', accountId)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      const rows = data as unknown as Array<{
        id: string; amount: string | number; description: string | null;
        transaction_date: string; categories: { name: string } | null
      }>
      const items: CycleTx[] = rows.map((r) => ({
        id: r.id, amount: Number(r.amount ?? 0), description: r.description,
        transactionDate: r.transaction_date, categoryName: r.categories?.name ?? null,
      }))
      return { items, total: items.reduce((s, i) => s + i.amount, 0) }
    },
  })
}
```

(El `.eq('accounts.type','credit')` ya no hace falta: filtramos por `account_id` de una tarjeta que sabemos de crédito.)

- [ ] **Step 4: `useCloseCycle` con `accountId`**

En `src/data/useCloseCycle.ts`, cambiar el genérico de la mutación a `{ accountId: string; billedAmount: number; dates: CycleDates }` y pasar `p_account_id: accountId` en `supabase.rpc('close_cycle', { ... })`:

```ts
return useMutation<CloseCycleResult, Error, { accountId: string; billedAmount: number; dates: CycleDates }>({
  mutationFn: async ({ accountId, billedAmount, dates }) => {
    const { data, error } = await supabase.rpc('close_cycle', {
      p_account_id: accountId,
      p_billed_amount: billedAmount,
      p_cycle_start: dates.cycleStart,
      p_cycle_end: dates.cycleEnd,
      p_due_date: dates.dueDate,
    })
    // ...resto igual (mapeo del resultado, onSettled invalida ['current-cycle'] (prefijo), ['slrd'], ['unpaid-cycles'])
  },
})
```

- [ ] **Step 5: Eliminar `usePrimaryCardConfig`**

En `src/data/useCardBillingConfig.ts`, borrar `usePrimaryCardConfig` (su único consumidor, `CicloScreen`, se reescribe en Task 4). `pickPrimaryCardConfig` (pura) puede quedar o borrarse; borrarla si no la usa nadie (verificar con grep en Task 4).

- [ ] **Step 6: Build**

Run: `npm run build`. Nota: quedará roto hasta que Task 4 repunte `CicloScreen` (usa `useCurrentCycleTransactions`/`usePrimaryCardConfig`, ya eliminados). Es esperado dentro de esta secuencia; el commit se hace igual porque Task 4 lo cierra. **Si preferís build verde por commit**, hacer Tasks 3 y 4 en un solo commit.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/data/useCurrentCycle.ts src/data/useUnpaidCycles.ts src/data/useUnpaidCycles.test.ts src/data/useCloseCycle.ts src/data/useCardBillingConfig.ts
git commit -m "feat(ciclos): hooks de ciclo por tarjeta (useOpenCycle, accountId en cierre/ciclos)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: UI — `CardCycleBlock` + `CicloScreen` por tarjeta

**Files:**
- Modify: `src/features/ciclo/CloseCycleSheet.tsx`
- Create: `src/features/ciclo/CardCycleBlock.tsx`
- Modify: `src/features/ciclo/CicloScreen.tsx`, `src/features/ciclo/CicloScreen.test.tsx`

**Interfaces:**
- Consumes: `useOpenCycle`, `useCloseCycle` (Task 3), `useAccounts`, `useCardBillingConfigs`, `CardCycleSheet`, `MoneyText`, `Skeleton`.

- [ ] **Step 1: `CloseCycleSheet` gana `accountId`**

En `src/features/ciclo/CloseCycleSheet.tsx`: agregar `accountId: string` a `Props`, y en `submit` pasar `accountId`:

```tsx
interface Props { open: boolean; accountId: string; config: BiceConfig; onClose: () => void; onClosed: (r: CloseCycleResult) => void }
// ...
function submit() {
  const dates = deriveCycleDates(config, new Date())
  close.mutate({ accountId, billedAmount: billed, dates }, { onSuccess: (r) => { onClosed(r); onClose() } })
}
```

- [ ] **Step 2: Crear `CardCycleBlock.tsx`**

```tsx
import { useState } from 'react'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { CardCycleSheet } from '../../components/CardCycleSheet'
import { CloseCycleSheet } from './CloseCycleSheet'
import { useOpenCycle } from '../../data/useCurrentCycle'
import type { Account, BiceConfig, CloseCycleResult } from '../../data/types'

export function CardCycleBlock({ card, config }: { card: Account; config: BiceConfig | null }) {
  const open = useOpenCycle(card.id)
  const [sheet, setSheet] = useState<null | 'config' | 'close'>(null)
  const [diff, setDiff] = useState<CloseCycleResult | null>(null)
  const hasConfig = !!config

  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-zinc-300">{card.name}</span>
        {open.isLoading
          ? <Skeleton className="h-6 w-24" />
          : <MoneyText value={open.data?.total ?? 0} className="text-xl text-zinc-50" />}
      </div>

      <div className="mt-2">
        {(open.data?.items ?? []).map((t) => (
          <div key={t.id} className="py-2.5 border-t border-ink-line flex justify-between items-center">
            <span className="text-sm text-zinc-200">{t.description ?? t.categoryName ?? 'Gasto'}</span>
            <MoneyText value={t.amount} className="text-sm text-zinc-300" />
          </div>
        ))}
        {open.data && open.data.items.length === 0 && (
          <p className="text-sm text-zinc-500 mt-2">Nada por facturar aún.</p>
        )}
      </div>

      {diff && diff.diferencia !== 0 && (
        <p className="mt-3 text-sm text-[var(--fresh-warn)]">
          Boleta <MoneyText value={diff.billedAmount} className="text-[var(--fresh-warn)]" /> vs registrado{' '}
          <MoneyText value={diff.sumaLedger} className="text-[var(--fresh-warn)]" /> →{' '}
          <MoneyText value={diff.diferencia} signed className="text-[var(--fresh-warn)]" /> sin identificar.
        </p>
      )}

      {!hasConfig && <p className="text-sm text-zinc-500 mt-3">Sin configurar — fijá las fechas para cerrar.</p>}

      <div className="flex gap-2 mt-3">
        <button onClick={() => setSheet('config')}
          className="border border-ink-line rounded-lg px-4 py-2.5 text-sm active:scale-[0.98]">Fechas</button>
        <button onClick={() => setSheet(hasConfig ? 'close' : 'config')}
          className="flex-1 bg-accent text-accent-deep font-medium rounded-lg py-2.5 active:scale-[0.98]">
          Cerrar ciclo
        </button>
      </div>

      <CardCycleSheet open={sheet === 'config'} accountId={card.id} initial={config} onClose={() => setSheet(null)} />
      {hasConfig && (
        <CloseCycleSheet open={sheet === 'close'} accountId={card.id} config={config}
          onClose={() => setSheet(null)} onClosed={setDiff} />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Reescribir `CicloScreen.tsx`**

```tsx
import { useAccounts } from '../../data/useAccounts'
import { useCardBillingConfigs } from '../../data/useCardBillingConfig'
import { CardCycleBlock } from './CardCycleBlock'
import { UnpaidCyclesSection } from './UnpaidCyclesSection'
import type { BiceConfig } from '../../data/types'

export function CicloScreen() {
  const accounts = useAccounts()
  const configs = useCardBillingConfigs()
  const creditCards = (accounts.data ?? []).filter((a) => a.type === 'credit')

  function configFor(id: string): BiceConfig | null {
    const c = (configs.data ?? []).find((x) => x.accountId === id)
    return c ? { closingDay: c.closingDay, dueDay: c.dueDay } : null
  }

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ciclos por tarjeta — sin facturar</p>

      {creditCards.length === 0 && !accounts.isLoading && (
        <p className="text-sm text-zinc-500 mt-3">No tenés tarjetas de crédito.</p>
      )}

      {creditCards.map((card) => (
        <CardCycleBlock key={card.id} card={card} config={configFor(card.id)} />
      ))}

      <UnpaidCyclesSection />
    </section>
  )
}
```

- [ ] **Step 4: Actualizar `CicloScreen.test.tsx`**

Reescribir para mockear `useAccounts`, `useCardBillingConfigs`, `useOpenCycle` (y lo que monte `UnpaidCyclesSection`). Test mínimo:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CicloScreen } from './CicloScreen'

vi.mock('../../data/useAccounts')
vi.mock('../../data/useCardBillingConfig')
vi.mock('../../data/useCurrentCycle')
vi.mock('../../data/useUnpaidCycles')
vi.mock('../../data/useSaveSnapshot')
import { useAccounts } from '../../data/useAccounts'
import { useCardBillingConfigs } from '../../data/useCardBillingConfig'
import { useOpenCycle } from '../../data/useCurrentCycle'
import { useUnpaidCycles, usePaidCycles } from '../../data/useUnpaidCycles'
import { useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'

beforeEach(() => {
  vi.mocked(useAccounts).mockReturnValue({ data: [
    { id: 'a1', name: 'BICE Visa', type: 'credit', bank: 'BICE' },
    { id: 'a3', name: 'Falabella', type: 'credit', bank: 'Falabella' },
    { id: 'a2', name: 'Santander', type: 'debit', bank: 'Santander' },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useCardBillingConfigs).mockReturnValue({ data: [
    { accountId: 'a1', closingDay: 5, dueDay: 20 },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useOpenCycle).mockReturnValue({ data: { items: [], total: 0 }, isLoading: false } as any)
  vi.mocked(useUnpaidCycles).mockReturnValue({ data: [] } as any)
  vi.mocked(usePaidCycles).mockReturnValue({ data: [] } as any)
  vi.mocked(useLatestSnapshotsByAccount).mockReturnValue({ data: {} } as any)
})

describe('CicloScreen', () => {
  it('should_RenderOneBlockPerCreditCard', () => {
    render(<CicloScreen />)
    expect(screen.getByText('BICE Visa')).toBeInTheDocument()
    expect(screen.getByText('Falabella')).toBeInTheDocument()
    expect(screen.queryByText('Santander')).not.toBeInTheDocument()
  })

  it('should_ShowSinConfigurar_When_CardHasNoConfig', () => {
    render(<CicloScreen />)
    expect(screen.getByText(/sin configurar/i)).toBeInTheDocument() // Falabella (a3) sin config
  })
})
```

- [ ] **Step 5: Correr suite + build**

Run: `npx vitest run && npm run build` → verde.

- [ ] **Step 6: Commit**

```bash
git add src/features/ciclo/CloseCycleSheet.tsx src/features/ciclo/CardCycleBlock.tsx src/features/ciclo/CicloScreen.tsx src/features/ciclo/CicloScreen.test.tsx
git commit -m "feat(ciclos): CicloScreen con una sección por tarjeta (CardCycleBlock)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `UnpaidCyclesSection` muestra la tarjeta de cada ciclo

**Files:**
- Modify: `src/features/ciclo/UnpaidCyclesSection.tsx`, `src/features/ciclo/UnpaidCyclesSection.test.tsx`

**Interfaces:**
- Consumes: `BillingCycle.accountId` (Task 3), `useAccounts` (ya usado en el componente).

- [ ] **Step 1: Actualizar el test**

En `src/features/ciclo/UnpaidCyclesSection.test.tsx`, asegurar que los ciclos mock traigan `accountId` y agregar una aserción de que se muestra el nombre de la tarjeta. Ejemplo de ciclo mock: `{ id:'c1', accountId:'a1', cycleStart:'…', cycleEnd:'…', dueDate:'2026-07-15', billedAmount:300000, isPaid:false }`, con `useAccounts` devolviendo la cuenta `a1` de nombre `'BICE Visa'`. Aserción: `expect(screen.getByText('BICE Visa')).toBeInTheDocument()`.

Run el test → FAIL (aún no se muestra el nombre).

- [ ] **Step 2: Mostrar el nombre de la tarjeta**

En `src/features/ciclo/UnpaidCyclesSection.tsx`, dentro del `.map` de ciclos impagos, resolver el nombre por `accountId` y mostrarlo junto a "vence":

```tsx
const nameOf = (accountId: string): string =>
  (accounts.data ?? []).find((a) => a.id === accountId)?.name ?? 'Tarjeta'
// ...
<span className="text-[11px] text-zinc-500">{nameOf(c.accountId)} · vence {c.dueDate}</span>
```

- [ ] **Step 3: Correr suite + build**

Run: `npx vitest run && npm run build` → verde.

- [ ] **Step 4: Commit**

```bash
git add src/features/ciclo/UnpaidCyclesSection.tsx src/features/ciclo/UnpaidCyclesSection.test.tsx
git commit -m "feat(ciclos): cada ciclo impago muestra su tarjeta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final (post-implementación)

Levantar la app (`mibanko-dev`, port 5173 — CONECTA A PRODUCCIÓN, cuidado con data de prueba) y confirmar:

1. Ciclo: una sección por cada tarjeta de crédito, con su total sin facturar. Débito no aparece.
2. Una tarjeta sin config muestra "sin configurar" y no deja cerrar; con config, "Cerrar ciclo" abre el NumberPad.
3. **Cierre por tarjeta (crítico):** cerrar el ciclo de la tarjeta X estampa **solo** los gastos de X (los de otras tarjetas siguen "sin facturar"). Verificar con un cierre de prueba y revisar en Movimientos / SQL (`select account_id, count(*) from transactions where billing_cycle_id = '<nuevo>' group by account_id` → una sola tarjeta).
4. `UnpaidCyclesSection`: cada ciclo pendiente muestra su tarjeta; pagar funciona.
5. SLRD/Dashboard: el número agregado sigue correcto (deuda facturada + no facturada suman across tarjetas).
```
