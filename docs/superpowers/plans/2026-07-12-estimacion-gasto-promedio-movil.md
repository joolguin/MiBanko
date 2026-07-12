# Estimación de gasto por promedio móvil — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sugerir un monto de presupuesto por categoría dentro de `BudgetSheet`, basado en el promedio móvil de gasto de los últimos 3 o 6 meses (seleccionable), tocable para cargarlo en el `NumberPad`.

**Architecture:** Una query de rango trae los gastos de los últimos 6 meses completos una sola vez (`useCategoryAverages`); una función pura (`computeCategoryAverages`) agrega por categoría y calcula el promedio sobre la ventana elegida. Cambiar 3/6 recalcula en cliente sin refetch. El núcleo puro (helpers de mes + promedio) queda separado del fetching y de la UI.

**Tech Stack:** React 19 + TypeScript, @tanstack/react-query, Supabase JS, Vitest + Testing Library, Tailwind.

## Global Constraints

- **Definición de gasto (idéntica a Presupuestos #6):** cuenta sólo `type === 'gasto'` con `categoryId !== null`. Nunca cuenta "Sin categoría", ingresos, `pago_tarjeta` ni `transferencia_interna`.
- **Mes en curso excluido:** el promedio se calcula sólo sobre meses calendario completos anteriores al actual.
- **Ventana:** seleccionable 3 o 6 meses en la UI. Default **3**. `AVG_MAX_MONTHS = 6`.
- **Divisor:** cantidad de meses del rango con actividad de gasto (cualquier categoría), con tope en la ventana. `avg = total_categoria / monthsCounted`.
- **Formato de dinero:** usar `MoneyText` (es-CL, `$45.000`). Redondear con `Math.round` al cargar el monto.
- **Convención de tests:** Vitest, nombres `should_X_When_Y`, fixtures locales tipadas `MonthTx`.
- **Commits:** Conventional Commits, en español, con trailer `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Estándares:** clean-code-standards (guard clauses, SRP, inmutabilidad, funciones chicas, nombres reveladores).

## File Structure

- `src/data/monthNav.ts` (modificar) — agrega `lastCompleteMonths` (puro).
- `src/data/monthNav.test.ts` (modificar) — tests de `lastCompleteMonths`.
- `src/data/categoryAverages.ts` (crear) — `computeCategoryAverages` (puro) + tipo `CategoryAverage`.
- `src/data/categoryAverages.test.ts` (crear) — tests del promedio.
- `src/data/useCategoryAverages.ts` (crear) — hook de fetch (reusa `mapMonthTxRow`).
- `src/features/historial/BudgetSheet.tsx` (modificar) — bloque de sugerencia + selector.
- `src/features/historial/BudgetSheet.test.tsx` (modificar) — tests del bloque.

---

### Task 1: `lastCompleteMonths` en monthNav

**Files:**
- Modify: `src/data/monthNav.ts`
- Test: `src/data/monthNav.test.ts`

**Interfaces:**
- Consumes: `shiftMonth(month, -1)` (ya existe en el mismo archivo).
- Produces: `lastCompleteMonths(current: MonthKey, n: number): MonthKey[]` — devuelve las `n` claves de mes completas anteriores a `current` (excluye `current`), en orden ascendente (más antigua primero).

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `src/data/monthNav.test.ts` (dentro del archivo, nuevo bloque `describe`), e importar `lastCompleteMonths` en la línea de import existente:

```ts
import { currentMonthKey, shiftMonth, monthLabel, monthRange, lastCompleteMonths } from './monthNav'
```

```ts
describe('lastCompleteMonths', () => {
  it('should_ReturnPreviousMonthsAscending_When_GivenCurrent', () => {
    expect(lastCompleteMonths('2026-07', 3)).toEqual(['2026-04', '2026-05', '2026-06'])
  })

  it('should_ExcludeCurrentMonth', () => {
    expect(lastCompleteMonths('2026-07', 3)).not.toContain('2026-07')
  })

  it('should_CrossYearBoundary', () => {
    expect(lastCompleteMonths('2026-02', 3)).toEqual(['2025-11', '2025-12', '2026-01'])
  })

  it('should_ReturnEmpty_When_NIsZero', () => {
    expect(lastCompleteMonths('2026-07', 0)).toEqual([])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/data/monthNav.test.ts`
Expected: FAIL — `lastCompleteMonths is not a function` / import no resuelto.

- [ ] **Step 3: Implementar el mínimo**

Agregar en `src/data/monthNav.ts` (después de `shiftMonth`):

```ts
export function lastCompleteMonths(current: MonthKey, n: number): MonthKey[] {
  const months: MonthKey[] = []
  let month = current
  for (let i = 0; i < n; i++) {
    month = shiftMonth(month, -1)
    months.push(month)
  }
  return months.reverse()
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/data/monthNav.test.ts`
Expected: PASS (todos los `describe`, incluidos los existentes).

- [ ] **Step 5: Commit**

```bash
git add src/data/monthNav.ts src/data/monthNav.test.ts
git commit -m "feat(estimacion): lastCompleteMonths para enumerar meses completos previos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `computeCategoryAverages` (función pura)

**Files:**
- Create: `src/data/categoryAverages.ts`
- Test: `src/data/categoryAverages.test.ts`

**Interfaces:**
- Consumes: tipos `MonthTx`, `MonthKey` de `./types`.
- Produces:
  - `interface CategoryAverage { avg: number; monthsCounted: number }`
  - `computeCategoryAverages(rows: MonthTx[], windowMonths: number, monthKeys: MonthKey[]): Map<string, CategoryAverage>` — clave del Map = `categoryId`. Filtra a gasto con categoría dentro de `monthKeys`; `monthsCounted` = meses de `monthKeys` con actividad de gasto (tope `windowMonths`); `avg = total_categoria / monthsCounted`. Categorías sin gasto no aparecen. Si no hay meses con actividad, Map vacío.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/data/categoryAverages.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeCategoryAverages } from './categoryAverages'
import type { MonthTx } from './types'

const WINDOW = ['2026-04', '2026-05', '2026-06']

function gasto(categoryId: string | null, amount: number, month: string): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: `${month}-15`, amount,
    type: 'gasto', categoryId, channel: null, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

describe('computeCategoryAverages', () => {
  it('should_AverageOverWindow_When_CategoryInEveryMonth', () => {
    const rows = [gasto('c1', 30, '2026-04'), gasto('c1', 30, '2026-05'), gasto('c1', 30, '2026-06')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 30, monthsCounted: 3 })
  })

  it('should_DivideByFullWindow_When_CategoryMissingSomeMonths', () => {
    // c1 aparece en 04 y 06; c2 da actividad en 05 -> 3 meses con actividad
    const rows = [gasto('c1', 60, '2026-04'), gasto('c1', 60, '2026-06'), gasto('c2', 10, '2026-05')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 40, monthsCounted: 3 })
  })

  it('should_DivideByAvailableMonths_When_HistoryShorterThanWindow', () => {
    const rows = [gasto('c1', 50, '2026-05'), gasto('c1', 50, '2026-06')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 50, monthsCounted: 2 })
  })

  it('should_IgnoreOutOfWindowMonths', () => {
    const rows = [gasto('c1', 999, '2026-01'), gasto('c1', 30, '2026-06')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 30, monthsCounted: 1 })
  })

  it('should_IgnoreNonGastoAndUncategorized', () => {
    const income: MonthTx = { ...gasto('c1', 1000, '2026-05'), type: 'ingreso' }
    const uncategorized = gasto(null, 500, '2026-05')
    const rows = [income, uncategorized, gasto('c1', 20, '2026-05')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 20, monthsCounted: 1 })
  })

  it('should_ReturnEmpty_When_NoQualifyingSpend', () => {
    const rows = [gasto(null, 500, '2026-05'), { ...gasto('c1', 100, '2026-05'), type: 'ingreso' as const }]

    expect(computeCategoryAverages(rows, 3, WINDOW).size).toBe(0)
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npx vitest run src/data/categoryAverages.test.ts`
Expected: FAIL — módulo `./categoryAverages` no existe.

- [ ] **Step 3: Implementar el mínimo**

Crear `src/data/categoryAverages.ts`:

```ts
import type { MonthTx, MonthKey } from './types'

export interface CategoryAverage {
  avg: number
  monthsCounted: number
}

function monthOf(tx: MonthTx): string {
  return tx.transactionDate.slice(0, 7)
}

export function computeCategoryAverages(
  rows: MonthTx[],
  windowMonths: number,
  monthKeys: MonthKey[],
): Map<string, CategoryAverage> {
  const result = new Map<string, CategoryAverage>()
  const windowSet = new Set(monthKeys)

  const qualifying = rows.filter(
    (t) => t.type === 'gasto' && t.categoryId !== null && windowSet.has(monthOf(t)),
  )
  if (qualifying.length === 0) return result

  const monthsWithActivity = new Set(qualifying.map(monthOf))
  const monthsCounted = Math.min(monthsWithActivity.size, windowMonths)
  if (monthsCounted === 0) return result

  const totals = new Map<string, number>()
  for (const t of qualifying) {
    const categoryId = t.categoryId as string
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + t.amount)
  }

  for (const [categoryId, total] of totals) {
    result.set(categoryId, { avg: total / monthsCounted, monthsCounted })
  }

  return result
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npx vitest run src/data/categoryAverages.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/categoryAverages.ts src/data/categoryAverages.test.ts
git commit -m "feat(estimacion): computeCategoryAverages con ventana y divisor por meses activos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `useCategoryAverages` (hook de fetch)

**Files:**
- Create: `src/data/useCategoryAverages.ts`

**Interfaces:**
- Consumes: `supabase` (`../lib/supabase`), `currentMonthKey`/`lastCompleteMonths`/`monthRange` (`./monthNav`), `mapMonthTxRow` (`./useMonthTransactions`, ya exportado), tipos `MonthTx`/`MonthKey`.
- Produces:
  - `AVG_MAX_MONTHS = 6`
  - `useCategoryAverages(): { rows: MonthTx[]; monthKeys: MonthKey[]; isLoading: boolean; isError: boolean }` — `monthKeys` son los 6 meses completos previos (ascendente); `rows` son los gastos (`type='gasto'`, `category_id` no nulo) de ese rango. `queryKey: ['category-averages']`.

Sin test unitario: sigue el patrón de `useMonthTransactions` (hook de fetch sin test dedicado; la lógica pura ya está cubierta en Tasks 1-2). Se valida con `npm run build` (typecheck).

- [ ] **Step 1: Crear el hook**

Crear `src/data/useCategoryAverages.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { currentMonthKey, lastCompleteMonths, monthRange } from './monthNav'
import { mapMonthTxRow } from './useMonthTransactions'
import type { MonthTx, MonthKey } from './types'

export const AVG_MAX_MONTHS = 6

export function useCategoryAverages(): {
  rows: MonthTx[]
  monthKeys: MonthKey[]
  isLoading: boolean
  isError: boolean
} {
  const monthKeys = lastCompleteMonths(currentMonthKey(new Date()), AVG_MAX_MONTHS)
  const { start } = monthRange(monthKeys[0])
  const { endExclusive } = monthRange(monthKeys[monthKeys.length - 1])

  const query = useQuery({
    queryKey: ['category-averages'],
    queryFn: async (): Promise<MonthTx[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount, type, channel, category_id, categories(name), accounts!inner(name, type)')
        .eq('type', 'gasto')
        .not('category_id', 'is', null)
        .gte('transaction_date', start)
        .lt('transaction_date', endExclusive)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMonthTxRow)
    },
  })

  return {
    rows: query.data ?? [],
    monthKeys,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
```

- [ ] **Step 2: Verificar typecheck**

Run: `npm run build`
Expected: build OK, sin errores de TypeScript. (Si falla por tipos de `db.ts`, regenerar tipos — ver memoria del proyecto.)

- [ ] **Step 3: Commit**

```bash
git add src/data/useCategoryAverages.ts
git commit -m "feat(estimacion): useCategoryAverages trae gastos de los últimos 6 meses

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Bloque de sugerencia en `BudgetSheet`

**Files:**
- Modify: `src/features/historial/BudgetSheet.tsx`
- Test: `src/features/historial/BudgetSheet.test.tsx`

**Interfaces:**
- Consumes: `useCategoryAverages` (Task 3), `computeCategoryAverages` (Task 2), `MoneyText` (ya importado), `useMemo` (react).
- Produces: sin nuevas exportaciones. El sheet muestra un selector 3/6 meses (default 3) y una línea "Promedio: $X" tocable que hace `setAmount(Math.round(avg))`; oculta el bloque cuando no hay promedio para la categoría.

- [ ] **Step 1: Escribir los tests que fallan**

Reemplazar el contenido de `src/features/historial/BudgetSheet.test.tsx` por:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetSheet } from './BudgetSheet'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'
import { useCategoryAverages } from '../../data/useCategoryAverages'
import type { MonthTx } from '../../data/types'

vi.mock('../../data/useBudgets')
vi.mock('../../data/useCategoryAverages')

const MONTH_KEYS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

function gasto(categoryId: string, amount: number, month: string): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: `${month}-15`, amount,
    type: 'gasto', categoryId, channel: null, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

// c1: 90k en 01-03, 30k en 04-06 -> ventana 3 = 30.000, ventana 6 = 60.000
const ROWS: MonthTx[] = [
  gasto('c1', 90000, '2026-01'), gasto('c1', 90000, '2026-02'), gasto('c1', 90000, '2026-03'),
  gasto('c1', 30000, '2026-04'), gasto('c1', 30000, '2026-05'), gasto('c1', 30000, '2026-06'),
]

describe('BudgetSheet', () => {
  beforeEach(() => {
    vi.mocked(useSaveBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
    vi.mocked(useDeleteBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
    vi.mocked(useCategoryAverages).mockReturnValue({
      rows: ROWS, monthKeys: MONTH_KEYS, isLoading: false, isError: false,
    })
  })

  it('should_ShowNewTitle_When_InitialAmountNull', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Supermercado" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.getByText(/Presupuesto de Supermercado/i)).toBeInTheDocument()
    expect(screen.queryByText(/Borrar presupuesto/i)).not.toBeInTheDocument()
  })

  it('should_ShowDeleteButton_When_EditingExistingBudget', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Supermercado" initialAmount={150000} onClose={vi.fn()} />)

    expect(screen.getByText(/Borrar presupuesto/i)).toBeInTheDocument()
  })

  it('should_ShowAverageSuggestion_When_HistoryExists', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.getByText(/Promedio/i)).toBeInTheDocument()
    expect(screen.getByText('$30.000')).toBeInTheDocument()
  })

  it('should_FillAmount_When_SuggestionTapped', async () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)
    expect(screen.getByText('$0')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Promedio/i }))

    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    // visor + sugerencia muestran el mismo monto
    expect(screen.getAllByText('$30.000').length).toBe(2)
  })

  it('should_Recompute_When_WindowSwitchedTo6', async () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /6 meses/i }))

    expect(screen.getByText('$60.000')).toBeInTheDocument()
  })

  it('should_HideSuggestion_When_NoHistory', () => {
    vi.mocked(useCategoryAverages).mockReturnValue({
      rows: [], monthKeys: MONTH_KEYS, isLoading: false, isError: false,
    })
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.queryByText(/Promedio/i)).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npx vitest run src/features/historial/BudgetSheet.test.tsx`
Expected: FAIL — los tests de sugerencia no encuentran "Promedio" (el bloque aún no existe). Los dos primeros pueden pasar; los nuevos fallan.

- [ ] **Step 3: Implementar el bloque en BudgetSheet**

En `src/features/historial/BudgetSheet.tsx`:

1) Actualizar imports (agregar `useMemo`, el hook y la función pura):

```tsx
import { useEffect, useMemo, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'
import { useCategoryAverages } from '../../data/useCategoryAverages'
import { computeCategoryAverages } from '../../data/categoryAverages'
```

2) Dentro del componente, después de `const [amount, setAmount] = useState(0)`, agregar el cálculo de la sugerencia:

```tsx
  const [windowMonths, setWindowMonths] = useState<3 | 6>(3)
  const { rows, monthKeys } = useCategoryAverages()
  const suggestion = useMemo(() => {
    if (!categoryId) return undefined
    const averages = computeCategoryAverages(rows, windowMonths, monthKeys.slice(-windowMonths))
    return averages.get(categoryId)
  }, [rows, monthKeys, windowMonths, categoryId])
```

3) Insertar el bloque entre el visor de monto y `<NumberPad>` (es decir, justo después del `</div>` que cierra el bloque "monto mensual", antes de `<NumberPad value={amount} onChange={setAmount} />`):

```tsx
        {suggestion && (
          <div>
            <div className="flex gap-2 mb-2">
              {([3, 6] as const).map((w) => (
                <button key={w} type="button" onClick={() => setWindowMonths(w)}
                  className={`rounded-lg px-3 py-1 text-xs active:scale-[0.98] ${
                    windowMonths === w ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
                  }`}>
                  {w} meses
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAmount(Math.round(suggestion.avg))}
              className="w-full text-left border border-ink-line rounded-lg px-3 py-2 active:scale-[0.98]">
              <span className="text-sm text-zinc-400">Promedio: </span>
              <MoneyText value={suggestion.avg} className="text-sm text-zinc-100" />
              {suggestion.monthsCounted < windowMonths && (
                <span className="text-[11px] text-zinc-500 ml-2">
                  promedio de {suggestion.monthsCounted} {suggestion.monthsCounted === 1 ? 'mes' : 'meses'}
                </span>
              )}
            </button>
          </div>
        )}
```

- [ ] **Step 4: Correr los tests y verificar que pasan**

Run: `npx vitest run src/features/historial/BudgetSheet.test.tsx`
Expected: PASS (los 6 tests).

- [ ] **Step 5: Correr toda la suite + build**

Run: `npx vitest run && npm run build`
Expected: todos los tests verdes, build OK.

- [ ] **Step 6: Commit**

```bash
git add src/features/historial/BudgetSheet.tsx src/features/historial/BudgetSheet.test.tsx
git commit -m "feat(estimacion): sugerencia de monto por promedio móvil en BudgetSheet

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Verificación final (post-implementación)

Levantar la app (`mibanko-dev`, port 5173 — CONECTA A PRODUCCIÓN, no crear data basura) y abrir Historial → Presupuestos → tocar "+ categoría" o una categoría con presupuesto para abrir `BudgetSheet`. Confirmar:

1. Aparece el selector "3 meses / 6 meses" y la línea "Promedio: $X" para una categoría con historial (p. ej. Comida, Hobbies).
2. Tocar la línea carga el monto en el visor/NumberPad.
3. Cambiar a "6 meses" recalcula el promedio.
4. Una categoría sin gasto histórico no muestra el bloque.
```
