# Presupuestos por categoría con alertas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir fijar un presupuesto mensual (CLP) por categoría de gasto y ver el avance con estados verde/ámbar/rojo dentro de Historial, más un aviso no bloqueante al registrar un gasto que cruza un umbral.

**Architecture:** Tabla `budgets` (una fila por categoría) en Supabase con RLS por `user_id`. Hooks React Query calcados de `useCategories`/`useSubscriptions`. Toda la lógica de estado vive en funciones puras testeables (`budgetStatus.ts`, `budgetHint.ts`) que consumen las transacciones del mes ya cargadas por `useMonthTransactions`. UI: nueva sub-pestaña "Presupuestos" en `HistorialScreen` + `BudgetSheet` para editar, y un hint en vivo en `RegistroScreen`.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, Supabase JS, Tailwind, Vitest + Testing Library.

## Global Constraints

- Umbrales fijos: `WARN_THRESHOLD = 0.8` (80%), `OVER_THRESHOLD = 1.0` (100%). Verbatim, no configurables.
- Qué cuenta como gasto de una categoría: `type === 'gasto'` y `categoryId === <cat>` (crédito BICE + débito Santander). Gasto con `categoryId === null` ("Sin categoría") nunca cuenta contra un presupuesto.
- Período: mes calendario. La tabla NO guarda período (la interpretación mensual vive en la capa de cálculo).
- Un presupuesto por categoría: `UNIQUE(category_id)`. `amount` int, `> 0`.
- La migración toca PRODUCCIÓN (proyecto `feljshqybemysbokqedp`). El ejecutor DEBE confirmar con la usuaria (Josefa) antes de `apply_migration`.
- Tras cualquier migración, regenerar `src/types/db.ts` con `generate_typescript_types` o el build se rompe en silencio (`tsc --noEmit` no lo detecta).
- Mutaciones de `budgets` solo invalidan `['budgets']`. No se agregan mutaciones sobre `transactions`; no tocar las invalidaciones de SLRD existentes.
- Convención de tests del repo: `should_<Comportamiento>_When_<Condición>`. Commits: Conventional Commits, terminan con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Verificación de build: `npm run build` (corre `tsc -b` + `vite build`). Tests: `npm test -- --run`.

---

### Task 1: Migración `budgets` + regenerar tipos

**Files:**
- Migración remota (Supabase MCP `apply_migration`, name: `create_budgets`)
- Modify (regenerado): `src/types/db.ts`

**Interfaces:**
- Consumes: tabla `categories(id, user_id, …)` existente.
- Produces: tabla `budgets(id, user_id, category_id, amount, created_at, updated_at)` con RLS; tipos en `db.ts` con la relación `budgets`.

- [ ] **Step 1: Confirmar con la usuaria antes de aplicar**

Mensaje a Josefa: "Voy a aplicar a PRODUCCIÓN la migración `create_budgets` (tabla nueva `budgets`, no toca datos existentes). ¿La aplico?". Esperar sí explícito. NO continuar sin confirmación.

- [ ] **Step 2: Aplicar la migración**

Usar `apply_migration` (proyecto `feljshqybemysbokqedp`, name `create_budgets`) con este SQL:

```sql
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id)
);

alter table public.budgets enable row level security;

create policy budgets_owner on public.budgets
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

- [ ] **Step 3: Verificar que la tabla existe**

Usar `execute_sql`: `select column_name from information_schema.columns where table_name = 'budgets' order by ordinal_position;`
Expected: filas `id, user_id, category_id, amount, created_at, updated_at`.

- [ ] **Step 4: Regenerar tipos TypeScript**

Usar `generate_typescript_types` (proyecto `feljshqybemysbokqedp`) y escribir el resultado completo sobre `src/types/db.ts`.

- [ ] **Step 5: Verificar build**

Run: `npm run build`
Expected: build OK (aparece el tipo `budgets` en `db.ts`, sin errores TS).

- [ ] **Step 6: Commit**

```bash
git add src/types/db.ts
git commit -m "feat(budgets): tabla budgets con RLS y tipos regenerados

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `categoryId` en `MonthTx`

Foundational y mecánico: los presupuestos matchean gasto↔categoría por id, no por nombre. `MonthTx` hoy solo trae `categoryName`.

**Files:**
- Modify: `src/data/types.ts` (interface `MonthTx`)
- Modify: `src/data/useMonthTransactions.ts` (select + `mapMonthTxRow`)
- Test: `src/data/useMonthTransactions.test.tsx`
- Modify (fix compile de literales `MonthTx`): `src/features/historial/CategorySpendTab.test.tsx:5-16`, `src/data/categorySpend.test.ts:5-11`, `src/features/historial/TransactionsTab.test.tsx:8-16`

**Interfaces:**
- Produces: `MonthTx.categoryId: string | null`.

- [ ] **Step 1: Actualizar el test de `mapMonthTxRow` (rojo)**

En `src/data/useMonthTransactions.test.tsx`, en el primer test agregar `category_id: 'c1'` al `row` y `categoryId: 'c1'` al objeto esperado:

```ts
const row = {
  id: 't1', transaction_date: '2026-07-12', amount: '12000', type: 'gasto',
  channel: 'wallet_pixel', category_id: 'c1',
  categories: { name: 'Comida' },
  accounts: { name: 'BICE Visa', type: 'credit' },
}

expect(mapMonthTxRow(row)).toEqual({
  id: 't1', transactionDate: '2026-07-12', amount: 12000, type: 'gasto',
  channel: 'wallet_pixel', categoryId: 'c1', categoryName: 'Comida',
  accountName: 'BICE Visa', accountType: 'credit',
})
```

En el segundo test agregar `assert`: `expect(tx.categoryId).toBeNull()` (y `category_id: null` en el row).

- [ ] **Step 2: Correr el test (falla)**

Run: `npm test -- --run src/data/useMonthTransactions.test.tsx`
Expected: FAIL (`categoryId` no está en el resultado).

- [ ] **Step 3: Agregar `categoryId` al tipo**

En `src/data/types.ts`, en `interface MonthTx` agregar tras `type`:

```ts
  categoryId: string | null
```

- [ ] **Step 4: Mapear e incluir en el select**

En `src/data/useMonthTransactions.ts`:
- En `mapMonthTxRow`, agregar al objeto retornado:
  ```ts
  categoryId: row.category_id ? String(row.category_id) : null,
  ```
- En el `.select(...)` agregar `category_id`:
  ```ts
  .select('id, transaction_date, amount, type, channel, category_id, categories(name), accounts!inner(name, type)')
  ```

- [ ] **Step 5: Correr el test (pasa)**

Run: `npm test -- --run src/data/useMonthTransactions.test.tsx`
Expected: PASS.

- [ ] **Step 6: Arreglar los helpers `MonthTx` de otros tests**

Agregar `categoryId: null,` al objeto base de cada helper (para que compilen con el campo nuevo requerido):
- `src/data/categorySpend.test.ts` helper `gasto` (línea ~5-11): agregar `categoryId: null,` junto a `categoryName`.
- `src/features/historial/CategorySpendTab.test.tsx` helper `gasto` (línea ~13): agregar `categoryId: null,`.
- `src/features/historial/TransactionsTab.test.tsx` helper `tx` (base object, línea ~13): agregar `categoryId: null,`.

- [ ] **Step 7: Correr toda la suite + build**

Run: `npm test -- --run && npm run build`
Expected: PASS y build OK (sin errores TS por `MonthTx` incompleto).

- [ ] **Step 8: Commit**

```bash
git add src/data/types.ts src/data/useMonthTransactions.ts src/data/useMonthTransactions.test.tsx src/data/categorySpend.test.ts src/features/historial/CategorySpendTab.test.tsx src/features/historial/TransactionsTab.test.tsx
git commit -m "feat(budgets): categoryId en MonthTx para matchear presupuestos por id

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Tipos `Budget` + hooks de datos

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/useBudgets.ts`
- Test: `src/data/useBudgets.test.ts`

**Interfaces:**
- Produces:
  - `interface Budget { id: string; categoryId: string; amount: number }`
  - `interface BudgetInput { categoryId: string; amount: number }`
  - `type BudgetState = 'ok' | 'warn' | 'over'`
  - `interface BudgetStatus { categoryId: string; categoryName: string; amount: number; spent: number; pct: number; state: BudgetState }`
  - `mapBudgetRow(row): Budget`
  - `useBudgets()` → query `['budgets']` → `Budget[]`
  - `useSaveBudget()` → mutation `BudgetInput` (upsert onConflict `category_id`)
  - `useDeleteBudget()` → mutation `string` (categoryId)

- [ ] **Step 1: Agregar tipos**

En `src/data/types.ts` agregar:

```ts
export interface Budget {
  id: string
  categoryId: string
  amount: number
}

export interface BudgetInput {
  categoryId: string
  amount: number
}

export type BudgetState = 'ok' | 'warn' | 'over'

export interface BudgetStatus {
  categoryId: string
  categoryName: string
  amount: number
  spent: number
  pct: number
  state: BudgetState
}
```

- [ ] **Step 2: Escribir el test de `mapBudgetRow` (rojo)**

Create `src/data/useBudgets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapBudgetRow } from './useBudgets'

describe('mapBudgetRow', () => {
  it('should_MapRow_When_GivenDbRow', () => {
    const row = { id: 'b1', category_id: 'c1', amount: 150000 }

    expect(mapBudgetRow(row)).toEqual({ id: 'b1', categoryId: 'c1', amount: 150000 })
  })

  it('should_CoerceAmountToNumber_When_AmountIsString', () => {
    const row = { id: 'b2', category_id: 'c2', amount: '90000' }

    expect(mapBudgetRow(row).amount).toBe(90000)
  })
})
```

- [ ] **Step 3: Correr el test (falla)**

Run: `npm test -- --run src/data/useBudgets.test.ts`
Expected: FAIL (`mapBudgetRow` no existe).

- [ ] **Step 4: Implementar hooks**

Create `src/data/useBudgets.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Budget, BudgetInput } from './types'

export function mapBudgetRow(row: Record<string, string | number | null>): Budget {
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    amount: Number(row.amount ?? 0),
  }
}

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase
        .from('budgets').select('id, category_id, amount')
      if (error) throw error
      return (data as Record<string, string | number | null>[]).map(mapBudgetRow)
    },
  })
}

export function useSaveBudget() {
  const qc = useQueryClient()
  return useMutation<void, Error, BudgetInput>({
    mutationFn: async (b) => {
      const row = { category_id: b.categoryId, amount: b.amount, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('budgets').upsert(row, { onConflict: 'category_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (categoryId) => {
      const { error } = await supabase.from('budgets').delete().eq('category_id', categoryId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}
```

- [ ] **Step 5: Correr el test (pasa)**

Run: `npm test -- --run src/data/useBudgets.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/useBudgets.ts src/data/useBudgets.test.ts
git commit -m "feat(budgets): tipos Budget y hooks useBudgets/useSaveBudget/useDeleteBudget

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `computeBudgetStatus` + helpers de estado

Núcleo de la lógica. Función pura.

**Files:**
- Create: `src/data/budgetStatus.ts`
- Test: `src/data/budgetStatus.test.ts`

**Interfaces:**
- Consumes: `MonthTx` (con `categoryId`, Task 2), `Budget`, `Category`, `BudgetState`, `BudgetStatus` (Task 3).
- Produces:
  - `WARN_THRESHOLD = 0.8`, `OVER_THRESHOLD = 1.0`
  - `budgetState(pct: number): BudgetState`
  - `stateRank(state: BudgetState): number` (`ok`=0, `warn`=1, `over`=2)
  - `computeBudgetStatus(txs: MonthTx[], budgets: Budget[], categories: Category[]): BudgetStatus[]`
  - `categoriesWithoutBudget(categories: Category[], budgets: Budget[]): Category[]`

- [ ] **Step 1: Escribir los tests (rojo)**

Create `src/data/budgetStatus.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeBudgetStatus, categoriesWithoutBudget, budgetState } from './budgetStatus'
import type { MonthTx, Budget, Category } from './types'

function gasto(categoryId: string | null, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryId, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

const cats: Category[] = [
  { id: 'c1', name: 'Supermercado' },
  { id: 'c2', name: 'Ocio' },
]

describe('budgetState', () => {
  it('should_ReturnOk_When_Below80', () => { expect(budgetState(0.79)).toBe('ok') })
  it('should_ReturnWarn_When_At80', () => { expect(budgetState(0.8)).toBe('warn') })
  it('should_ReturnWarn_When_At99', () => { expect(budgetState(0.99)).toBe('warn') })
  it('should_ReturnOver_When_At100', () => { expect(budgetState(1.0)).toBe('over') })
  it('should_ReturnOver_When_Above100', () => { expect(budgetState(1.05)).toBe('over') })
})

describe('computeBudgetStatus', () => {
  it('should_SumGastoByCategory_When_MatchingBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]
    const result = computeBudgetStatus([gasto('c1', 60), gasto('c1', 20)], budgets, cats)

    expect(result).toEqual([
      { categoryId: 'c1', categoryName: 'Supermercado', amount: 100, spent: 80, pct: 0.8, state: 'warn' },
    ])
  })

  it('should_ExcludeUncategorizedSpend_When_Summing', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]
    const result = computeBudgetStatus([gasto(null, 50), gasto('c1', 30)], budgets, cats)

    expect(result[0].spent).toBe(30)
  })

  it('should_IgnoreNonGasto_When_Summing', () => {
    const income: MonthTx = { ...gasto('c1', 1000), type: 'ingreso' }
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]

    expect(computeBudgetStatus([income, gasto('c1', 40)], budgets, cats)[0].spent).toBe(40)
  })

  it('should_MarkOver_When_SpentExceedsBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]
    const result = computeBudgetStatus([gasto('c1', 105)], budgets, cats)

    expect(result[0].state).toBe('over')
    expect(result[0].pct).toBeCloseTo(1.05)
  })

  it('should_ZeroSpent_When_NoTxForBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c2', amount: 100 }]
    const result = computeBudgetStatus([gasto('c1', 50)], budgets, cats)

    expect(result[0]).toMatchObject({ categoryId: 'c2', spent: 0, pct: 0, state: 'ok' })
  })

  it('should_SortByPctDesc_When_MultipleBudgets', () => {
    const budgets: Budget[] = [
      { id: 'b1', categoryId: 'c1', amount: 100 },
      { id: 'b2', categoryId: 'c2', amount: 100 },
    ]
    const result = computeBudgetStatus([gasto('c1', 20), gasto('c2', 90)], budgets, cats)

    expect(result.map((r) => r.categoryId)).toEqual(['c2', 'c1'])
  })
})

describe('categoriesWithoutBudget', () => {
  it('should_ReturnCategoriesWithNoBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]

    expect(categoriesWithoutBudget(cats, budgets)).toEqual([{ id: 'c2', name: 'Ocio' }])
  })
})
```

- [ ] **Step 2: Correr los tests (fallan)**

Run: `npm test -- --run src/data/budgetStatus.test.ts`
Expected: FAIL (`budgetStatus` no existe).

- [ ] **Step 3: Implementar**

Create `src/data/budgetStatus.ts`:

```ts
import type { MonthTx, Budget, Category, BudgetState, BudgetStatus } from './types'

export const WARN_THRESHOLD = 0.8
export const OVER_THRESHOLD = 1.0

export function budgetState(pct: number): BudgetState {
  if (pct >= OVER_THRESHOLD) return 'over'
  if (pct >= WARN_THRESHOLD) return 'warn'
  return 'ok'
}

export function stateRank(state: BudgetState): number {
  return state === 'over' ? 2 : state === 'warn' ? 1 : 0
}

export function computeBudgetStatus(
  txs: MonthTx[],
  budgets: Budget[],
  categories: Category[],
): BudgetStatus[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const spentByCat = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'gasto' || t.categoryId === null) continue
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount)
  }

  return budgets
    .map((b): BudgetStatus => {
      const spent = spentByCat.get(b.categoryId) ?? 0
      const pct = b.amount > 0 ? spent / b.amount : 0
      return {
        categoryId: b.categoryId,
        categoryName: nameById.get(b.categoryId) ?? 'Sin categoría',
        amount: b.amount,
        spent,
        pct,
        state: budgetState(pct),
      }
    })
    .sort((a, b) => b.pct - a.pct)
}

export function categoriesWithoutBudget(
  categories: Category[],
  budgets: Budget[],
): Category[] {
  const budgeted = new Set(budgets.map((b) => b.categoryId))
  return categories.filter((c) => !budgeted.has(c.id))
}
```

- [ ] **Step 4: Correr los tests (pasan)**

Run: `npm test -- --run src/data/budgetStatus.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/data/budgetStatus.ts src/data/budgetStatus.test.ts
git commit -m "feat(budgets): computeBudgetStatus con umbrales 80/100 y helpers de estado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `BudgetSheet` (fijar / editar / borrar monto)

**Files:**
- Create: `src/features/historial/BudgetSheet.tsx`
- Test: `src/features/historial/BudgetSheet.test.tsx`

**Interfaces:**
- Consumes: `useSaveBudget`, `useDeleteBudget` (Task 3), `BottomSheet`, `NumberPad`, `MoneyText` (existentes).
- Produces: `BudgetSheet` con props:
  ```ts
  interface Props {
    open: boolean
    categoryId: string | null   // categoría a la que se le fija presupuesto
    categoryName: string
    initialAmount: number | null // null = presupuesto nuevo; number = editar
    onClose: () => void
  }
  ```

- [ ] **Step 1: Escribir el test (rojo)**

Create `src/features/historial/BudgetSheet.test.tsx`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetSheet } from './BudgetSheet'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'

vi.mock('../../data/useBudgets')

describe('BudgetSheet', () => {
  beforeEach(() => {
    vi.mocked(useSaveBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
    vi.mocked(useDeleteBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
  })

  it('should_ShowNewTitle_When_InitialAmountNull', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Supermercado" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.getByText(/Presupuesto de Supermercado/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Borrar/i })).not.toBeInTheDocument()
  })

  it('should_ShowDeleteButton_When_EditingExistingBudget', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Supermercado" initialAmount={150000} onClose={vi.fn()} />)

    expect(screen.getByRole('button', { name: /Borrar/i })).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test (falla)**

Run: `npm test -- --run src/features/historial/BudgetSheet.test.tsx`
Expected: FAIL (`BudgetSheet` no existe).

- [ ] **Step 3: Implementar**

Create `src/features/historial/BudgetSheet.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'

interface Props {
  open: boolean
  categoryId: string | null
  categoryName: string
  initialAmount: number | null
  onClose: () => void
}

export function BudgetSheet({ open, categoryId, categoryName, initialAmount, onClose }: Props) {
  const save = useSaveBudget()
  const del = useDeleteBudget()
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    if (!open) return
    setAmount(initialAmount ?? 0)
  }, [open, initialAmount])

  const canSave = amount > 0 && !!categoryId && !save.isPending
  const isEditing = initialAmount !== null

  function submit() {
    if (!categoryId) return
    save.mutate({ categoryId, amount }, { onSuccess: onClose })
  }

  function remove() {
    if (!categoryId) return
    del.mutate(categoryId, { onSuccess: onClose })
  }

  return (
    <BottomSheet open={open} title={`Presupuesto de ${categoryName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-1">monto mensual</p>
          <MoneyText value={amount} className="text-3xl text-zinc-50" />
        </div>

        <NumberPad value={amount} onChange={setAmount} />

        {(save.isError || del.isError) && (
          <p className="text-debt text-sm">No se pudo guardar. Reintentá.</p>
        )}

        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>

        {isEditing && (
          <button onClick={remove} disabled={del.isPending}
            className="text-debt text-sm py-2 active:scale-[0.98] transition-transform disabled:opacity-40">
            {del.isPending ? 'Borrando…' : 'Borrar presupuesto'}
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test -- --run src/features/historial/BudgetSheet.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/BudgetSheet.tsx src/features/historial/BudgetSheet.test.tsx
git commit -m "feat(budgets): BudgetSheet para fijar/editar/borrar monto por categoría

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `BudgetsTab` + integración en `HistorialScreen`

**Files:**
- Create: `src/features/historial/BudgetsTab.tsx`
- Test: `src/features/historial/BudgetsTab.test.tsx`
- Modify: `src/features/historial/HistorialScreen.tsx`

**Interfaces:**
- Consumes: `useMonthTransactions` (Task 2), `useBudgets` (Task 3), `useCategories`, `computeBudgetStatus`, `categoriesWithoutBudget` (Task 4), `BudgetSheet` (Task 5), `MonthNav`, `Skeleton`, `MoneyText`.
- Produces: `BudgetsTab` con props `{ month: MonthKey; onMonthChange: (m: MonthKey) => void }`; sub-tab `'presupuestos'` en `HistorialScreen`.

- [ ] **Step 1: Escribir el test (rojo)**

Create `src/features/historial/BudgetsTab.test.tsx`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetsTab } from './BudgetsTab'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { useBudgets } from '../../data/useBudgets'
import { useCategories } from '../../data/useCategories'

vi.mock('../../data/useMonthTransactions')
vi.mock('../../data/useBudgets')
vi.mock('../../data/useCategories')

function setupDefaults() {
  vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  vi.mocked(useBudgets).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  vi.mocked(useCategories).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
}

describe('BudgetsTab', () => {
  beforeEach(() => setupDefaults())

  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: true, isError: false } as any)
    const { container } = render(<BudgetsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelector('.animate-pulse, [data-skeleton]')).toBeTruthy()
  })

  it('should_ShowEmptyHint_When_NoBudgets', () => {
    render(<BudgetsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText(/Sin presupuestos/i)).toBeInTheDocument()
  })

  it('should_RenderBudgetRowWithSpentAndPct_When_HasBudget', () => {
    vi.mocked(useBudgets).mockReturnValue({
      isLoading: false, isError: false, data: [{ id: 'b1', categoryId: 'c1', amount: 100000 }],
    } as any)
    vi.mocked(useCategories).mockReturnValue({
      isLoading: false, isError: false, data: [{ id: 'c1', name: 'Supermercado' }],
    } as any)
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [{
        id: 't1', transactionDate: '2026-07-05', amount: 80000, type: 'gasto',
        channel: null, categoryId: 'c1', categoryName: 'Supermercado',
        accountName: 'BICE', accountType: 'credit',
      }],
    } as any)

    render(<BudgetsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText('Supermercado')).toBeInTheDocument()
    expect(screen.getByText(/80\s*%/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test (falla)**

Run: `npm test -- --run src/features/historial/BudgetsTab.test.tsx`
Expected: FAIL (`BudgetsTab` no existe).

- [ ] **Step 3: Implementar `BudgetsTab`**

Create `src/features/historial/BudgetsTab.tsx`:

```tsx
import { useState } from 'react'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { useBudgets } from '../../data/useBudgets'
import { useCategories } from '../../data/useCategories'
import { computeBudgetStatus, categoriesWithoutBudget } from '../../data/budgetStatus'
import { BudgetSheet } from './BudgetSheet'
import { MonthNav } from './MonthNav'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import type { BudgetState, MonthKey } from '../../data/types'

const BAR_COLOR: Record<BudgetState, string> = {
  ok: 'bg-accent',
  warn: 'bg-amber-500',
  over: 'bg-debt',
}

interface SheetState { categoryId: string; categoryName: string; initialAmount: number | null }

export function BudgetsTab(
  { month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void },
) {
  const txs = useMonthTransactions(month)
  const budgets = useBudgets()
  const categories = useCategories()
  const [sheet, setSheet] = useState<SheetState | null>(null)

  const loading = txs.isLoading || budgets.isLoading || categories.isLoading
  const error = txs.isError || budgets.isError || categories.isError

  const statuses = computeBudgetStatus(txs.data ?? [], budgets.data ?? [], categories.data ?? [])
  const unbudgeted = categoriesWithoutBudget(categories.data ?? [], budgets.data ?? [])

  return (
    <div>
      <MonthNav month={month} onChange={onMonthChange} />

      {loading && <Skeleton className="h-48 w-full mt-4" />}

      {error && (
        <p className="text-debt text-sm mt-4">No se pudieron cargar los presupuestos. Reintentá.</p>
      )}

      {!loading && !error && (
        <>
          {statuses.length === 0 && (
            <p className="text-sm text-zinc-500 mt-6">Sin presupuestos. Agregá el primero abajo.</p>
          )}

          <ul className="mt-4">
            {statuses.map((s) => (
              <li key={s.categoryId}>
                <button
                  onClick={() => setSheet({ categoryId: s.categoryId, categoryName: s.categoryName, initialAmount: s.amount })}
                  className="w-full text-left py-3 border-t border-ink-line active:bg-ink-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200 flex-1">{s.categoryName}</span>
                    <span className="text-sm text-zinc-400">
                      <MoneyText value={s.spent} className="text-zinc-300" /> / <MoneyText value={s.amount} className="text-zinc-500" />
                    </span>
                    <span className="text-[11px] text-zinc-500 w-10 text-right">{Math.round(s.pct * 100)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-ink-2 overflow-hidden">
                    <div className={`h-full ${BAR_COLOR[s.state]}`}
                      style={{ width: `${Math.min(s.pct, 1) * 100}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {unbudgeted.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-2">agregar presupuesto</p>
              <div className="flex flex-wrap gap-2">
                {unbudgeted.map((c) => (
                  <button key={c.id}
                    onClick={() => setSheet({ categoryId: c.id, categoryName: c.name, initialAmount: null })}
                    className="border border-ink-line rounded-lg px-3 py-1.5 text-sm text-zinc-400 active:scale-[0.98]">
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BudgetSheet
        open={sheet !== null}
        categoryId={sheet?.categoryId ?? null}
        categoryName={sheet?.categoryName ?? ''}
        initialAmount={sheet?.initialAmount ?? null}
        onClose={() => setSheet(null)}
      />
    </div>
  )
}
```

- [ ] **Step 4: Correr el test (pasa)**

Run: `npm test -- --run src/features/historial/BudgetsTab.test.tsx`
Expected: PASS. (Si el matcher del Skeleton falla, ajustar el selector al markup real de `src/components/ui/Skeleton.tsx` — leerlo y usar su className real.)

- [ ] **Step 5: Integrar en `HistorialScreen`**

En `src/features/historial/HistorialScreen.tsx`:
- Importar: `import { BudgetsTab } from './BudgetsTab'`
- Ampliar el tipo y las tabs:
  ```tsx
  type SubTab = 'slrd' | 'gasto' | 'presupuestos' | 'movimientos'
  const TABS: { value: SubTab; label: string }[] = [
    { value: 'slrd', label: 'SLRD' },
    { value: 'gasto', label: 'Gasto' },
    { value: 'presupuestos', label: 'Presupuestos' },
    { value: 'movimientos', label: 'Movimientos' },
  ]
  ```
- Agregar el render tras la línea de `gasto`:
  ```tsx
  {tab === 'presupuestos' && <BudgetsTab month={month} onMonthChange={setMonth} />}
  ```

- [ ] **Step 6: Correr suite + build**

Run: `npm test -- --run && npm run build`
Expected: PASS y build OK.

- [ ] **Step 7: Commit**

```bash
git add src/features/historial/BudgetsTab.tsx src/features/historial/BudgetsTab.test.tsx src/features/historial/HistorialScreen.tsx
git commit -m "feat(budgets): sub-pestaña Presupuestos en Historial con barras de avance

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Aviso al registrar (hint en vivo que cruza umbral)

`RegistroScreen` navega fuera al guardar (`nav('/')`), así que el aviso se muestra **en vivo**, bajo los chips, mientras la usuaria arma el gasto: si el monto proyectado empuja la categoría a un estado peor del que ya tenía (cruza a `warn`/`over`), aparece el aviso no bloqueante.

**Files:**
- Create: `src/data/budgetHint.ts`
- Test: `src/data/budgetHint.test.ts`
- Modify: `src/features/registro/RegistroScreen.tsx`

**Interfaces:**
- Consumes: `budgetState`, `stateRank` (Task 4), `Budget`, `MonthTx`, `BudgetState` (Tasks 2–4).
- Produces:
  ```ts
  interface BudgetHint { categoryName: string; projectedSpent: number; amount: number; pct: number; state: 'warn' | 'over' }
  function budgetHint(categoryId, addedAmount, monthTxs, budgets, categoryName): BudgetHint | null
  ```

- [ ] **Step 1: Escribir los tests (rojo)**

Create `src/data/budgetHint.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { budgetHint } from './budgetHint'
import type { MonthTx, Budget } from './types'

function gasto(categoryId: string | null, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryId, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]

describe('budgetHint', () => {
  it('should_ReturnNull_When_NoCategory', () => {
    expect(budgetHint(null, 50, [], budgets, 'X')).toBeNull()
  })

  it('should_ReturnNull_When_AmountZero', () => {
    expect(budgetHint('c1', 0, [], budgets, 'Super')).toBeNull()
  })

  it('should_ReturnNull_When_CategoryHasNoBudget', () => {
    expect(budgetHint('c2', 50, [], budgets, 'Ocio')).toBeNull()
  })

  it('should_ReturnNull_When_StaysBelowWarn', () => {
    // 0 previo + 50 = 50% < 80%
    expect(budgetHint('c1', 50, [], budgets, 'Super')).toBeNull()
  })

  it('should_ReturnWarn_When_CrossesInto80', () => {
    // 0 previo + 85 = 85% => warn (cruza desde ok)
    const hint = budgetHint('c1', 85, [], budgets, 'Super')

    expect(hint).toMatchObject({ categoryName: 'Super', projectedSpent: 85, amount: 100, state: 'warn' })
    expect(hint!.pct).toBeCloseTo(0.85)
  })

  it('should_ReturnOver_When_CrossesFromWarnToOver', () => {
    // 85 previo (warn) + 20 = 105% => over (cruza de warn a over)
    const hint = budgetHint('c1', 20, [gasto('c1', 85)], budgets, 'Super')

    expect(hint).toMatchObject({ state: 'over' })
  })

  it('should_ReturnNull_When_AlreadyOverAndStaysOver', () => {
    // 110 previo (over) + 5 sigue over => no re-molesta (no cruza)
    expect(budgetHint('c1', 5, [gasto('c1', 110)], budgets, 'Super')).toBeNull()
  })
})
```

- [ ] **Step 2: Correr los tests (fallan)**

Run: `npm test -- --run src/data/budgetHint.test.ts`
Expected: FAIL (`budgetHint` no existe).

- [ ] **Step 3: Implementar**

Create `src/data/budgetHint.ts`:

```ts
import { budgetState, stateRank } from './budgetStatus'
import type { Budget, MonthTx } from './types'

export interface BudgetHint {
  categoryName: string
  projectedSpent: number
  amount: number
  pct: number
  state: 'warn' | 'over'
}

export function budgetHint(
  categoryId: string | null,
  addedAmount: number,
  monthTxs: MonthTx[],
  budgets: Budget[],
  categoryName: string,
): BudgetHint | null {
  if (categoryId === null || addedAmount <= 0) return null
  const budget = budgets.find((b) => b.categoryId === categoryId)
  if (!budget || budget.amount <= 0) return null

  const current = monthTxs
    .filter((t) => t.type === 'gasto' && t.categoryId === categoryId)
    .reduce((sum, t) => sum + t.amount, 0)
  const projectedSpent = current + addedAmount

  const currentState = budgetState(current / budget.amount)
  const projectedState = budgetState(projectedSpent / budget.amount)

  // Solo avisa si el gasto CRUZA a un estado peor (ok→warn/over, warn→over).
  if (stateRank(projectedState) <= stateRank(currentState)) return null

  return {
    categoryName,
    projectedSpent,
    amount: budget.amount,
    pct: projectedSpent / budget.amount,
    state: projectedState as 'warn' | 'over',
  }
}
```

- [ ] **Step 4: Correr los tests (pasan)**

Run: `npm test -- --run src/data/budgetHint.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Cablear el hint en `RegistroScreen`**

En `src/features/registro/RegistroScreen.tsx`:
- Imports nuevos:
  ```tsx
  import { useBudgets } from '../../data/useBudgets'
  import { useMonthTransactions } from '../../data/useMonthTransactions'
  import { budgetHint } from '../../data/budgetHint'
  import { currentMonthKey } from '../../data/monthNav'
  ```
- Dentro del componente, junto a los otros hooks:
  ```tsx
  const budgets = useBudgets()
  const monthTxs = useMonthTransactions(currentMonthKey(new Date()))
  ```
- Tras la línea `const category = ...`:
  ```tsx
  const hint = budgetHint(categoryId, amount, monthTxs.data ?? [], budgets.data ?? [], category?.name ?? '')
  ```
- Renderizar el aviso tras el bloque de chips (después del `</div>` que cierra `flex flex-wrap gap-2 mt-6`):
  ```tsx
  {hint && (
    <p className={`mt-3 text-sm ${hint.state === 'over' ? 'text-debt' : 'text-amber-500'}`}>
      Con esto quedás en <MoneyText value={hint.projectedSpent} className="inline" /> de{' '}
      <MoneyText value={hint.amount} className="inline" /> en {hint.categoryName} ({Math.round(hint.pct * 100)}%)
    </p>
  )}
  ```
  (Si `MoneyText` no soporta render inline con `className`, usar `Intl.NumberFormat` local o el helper de formato de moneda existente; leer `src/components/ui/MoneyText.tsx` para confirmar.)

- [ ] **Step 6: Correr suite + build**

Run: `npm test -- --run && npm run build`
Expected: PASS y build OK. Confirmar que `RegistroScreen` sigue renderizando (tests existentes de registro, si los hay, verdes).

- [ ] **Step 7: Commit**

```bash
git add src/data/budgetHint.ts src/data/budgetHint.test.ts src/features/registro/RegistroScreen.tsx
git commit -m "feat(budgets): aviso no bloqueante al registrar cuando el gasto cruza umbral

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final (post-tasks)

- `npm test -- --run` — toda la suite verde.
- `npm run build` — build OK, tipos regenerados incluyen `budgets`.
- Ejercitar el flujo real (skill `verify` / app): crear un presupuesto en Historial → Presupuestos, registrar un gasto de esa categoría, ver la barra cambiar de color y el aviso al cruzar 80%/100%.
- Whole-branch review (`superpowers:requesting-code-review`) antes de finishing.

## Notas de scope (fuera de este plan)

- Push notifications (permiso, SW push, cron server-side).
- Tope global mensual (presupuesto no atado a `category_id`).
- Períodos distintos al mes calendario (ciclo BICE) — el modelo quedó abierto para agregarlo sin reescribir.
