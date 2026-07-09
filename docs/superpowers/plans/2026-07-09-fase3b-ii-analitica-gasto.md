# Analítica de gasto y movimientos (3b-ii) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar la pantalla Historial con sub-tabs `SLRD | Gasto | Movimientos`: una dona de gasto por categoría por mes y una lista de transacciones del mes con filtros.

**Architecture:** Sin backend nuevo. Un hook `useMonthTransactions(mes)` trae las transacciones del mes (join a `categories`/`accounts`); la dona y la lista se derivan de esos mismos datos con lógica pura testeable (`categorySpend`, `donutGeometry`, `monthNav`). El gráfico es SVG a mano (técnica de círculo con `stroke-dasharray`, sin librería). `HistorialScreen` se refactoriza para alojar las sub-tabs y un `selectedMonth` compartido por Gasto+Movimientos.

**Tech Stack:** React 19 + TypeScript, TanStack Query, Tailwind, Vitest + Testing Library. Supabase (solo lecturas). SVG a mano.

## Global Constraints

- Ningún componente llama `supabase-js` directo: siempre vía hooks en `src/data/`.
- Timezone de cualquier cálculo por fecha: **America/Santiago**.
- Toda pantalla/sección: estados **loading (skeleton) / empty (texto tranquilo) / error (inline + retry)**.
- Gráficos: **SVG a mano, sin librería** (el bundle es el límite). Sin dependencias nuevas.
- Tests: lógica pura en `.test.ts`, componentes en `.test.tsx`, con `const user = userEvent.setup()`.
- Clean code: nombres descriptivos, funciones cortas (SRP), guard clauses, sin números mágicos.
- Moneda CLP sin decimales: usar `MoneyText` / `formatCLP` / `formatSignedCLP` (`src/lib/format.ts`).
- Commits: Conventional Commits, **sin** `Co-Authored-By` ni trailers de co-autoría de IA.
- Signo en la lista: `ingreso` positivo (+); `gasto`/`pago_tarjeta`/`transferencia_interna` negativos (−).
- Paleta categórica de la dona (validada con dataviz sobre la superficie oscura `#0c0c0e`, WARN de CVD en banda-piso mitigado por la leyenda con direct labels):
  `SEGMENT_COLORS = ['#3987e5','#199e70','#c98500','#008300','#9085e9','#e66767']`, `OTHER_COLOR = '#52525b'`.
  El texto de la leyenda usa tokens de texto (zinc), nunca el color de la serie; el color va en un swatch.

## File Structure

- `src/data/types.ts` — `MonthKey`, `MonthTx`, `CategorySpendSegment`.
- `src/data/monthNav.ts` (+ `.test.ts`) — navegación de meses (pura).
- `src/data/useMonthTransactions.ts` (+ `.test.tsx`) — query del mes + `mapMonthTxRow`.
- `src/data/categorySpend.ts` (+ `.test.ts`) — agregación por categoría (pura).
- `src/data/donutGeometry.ts` (+ `.test.ts`) — dashes de la dona (pura).
- `src/features/historial/MonthNav.tsx` (+ `.test.tsx`) — control ‹ mes ›.
- `src/features/historial/CategoryDonut.tsx` (+ `.test.tsx`) — SVG de la dona.
- `src/features/historial/CategorySpendTab.tsx` (+ `.test.tsx`) — sub-tab Gasto.
- `src/features/historial/TransactionsTab.tsx` (+ `.test.tsx`) — sub-tab Movimientos.
- `src/features/historial/SlrdTab.tsx` — extracción del contenido SLRD de 3b-i.
- `src/features/historial/HistorialScreen.tsx` (+ `.test.tsx`) — refactor a sub-tabs.

---

## Task 1: Navegación de meses (lógica pura) + tipo MonthKey

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/monthNav.ts`
- Test: `src/data/monthNav.test.ts`

**Interfaces:**
- Produces:
  - `type MonthKey = string` (formato `'AAAA-MM'`).
  - `currentMonthKey(today: Date): MonthKey`
  - `shiftMonth(month: MonthKey, delta: -1 | 1): MonthKey`
  - `monthLabel(month: MonthKey): string`  (ej. `'Julio 2026'`)
  - `monthRange(month: MonthKey): { start: string; endExclusive: string }` (fechas `'AAAA-MM-DD'`)

- [ ] **Step 1: Escribir los tests (fallan)**

Create `src/data/monthNav.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { currentMonthKey, shiftMonth, monthLabel, monthRange } from './monthNav'

describe('currentMonthKey', () => {
  it('should_ReturnMonthInSantiago_When_GivenUtcInstant', () => {
    // 2026-08-01T02:00Z es 2026-07-31 22:00 en Santiago (UTC-4) -> mes 2026-07
    const key = currentMonthKey(new Date('2026-08-01T02:00:00Z'))

    expect(key).toBe('2026-07')
  })
})

describe('shiftMonth', () => {
  it('should_GoToNextMonth_When_DeltaIsPlusOne', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08')
  })

  it('should_RollOverYear_When_December', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('should_RollBackYear_When_January', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('monthLabel', () => {
  it('should_ReturnCapitalizedSpanishLabel', () => {
    expect(monthLabel('2026-07')).toBe('Julio 2026')
  })
})

describe('monthRange', () => {
  it('should_ReturnHalfOpenRange_When_GivenMonth', () => {
    expect(monthRange('2026-07')).toEqual({ start: '2026-07-01', endExclusive: '2026-08-01' })
  })

  it('should_RollOverYear_When_December', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' })
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/data/monthNav.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Agregar el tipo en types.ts**

Add to `src/data/types.ts` (al final):

```ts
export type MonthKey = string // 'AAAA-MM'
```

- [ ] **Step 4: Escribir la lógica pura**

Create `src/data/monthNav.ts`:

```ts
import type { MonthKey } from './types'

const SANTIAGO = 'America/Santiago'

export function currentMonthKey(today: Date): MonthKey {
  // 'en-CA' produce 'AAAA-MM-DD'; nos quedamos con 'AAAA-MM'.
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: SANTIAGO }).format(today)
  return ymd.slice(0, 7)
}

function parse(month: MonthKey): { year: number; monthIndex: number } {
  const [year, monthNumber] = month.split('-').map(Number)
  return { year, monthIndex: monthNumber - 1 } // monthIndex 0..11
}

function format(year: number, monthIndex: number): MonthKey {
  const normalizedYear = year + Math.floor(monthIndex / 12)
  const normalizedMonth = ((monthIndex % 12) + 12) % 12
  return `${normalizedYear}-${String(normalizedMonth + 1).padStart(2, '0')}`
}

export function shiftMonth(month: MonthKey, delta: -1 | 1): MonthKey {
  const { year, monthIndex } = parse(month)
  return format(year, monthIndex + delta)
}

export function monthLabel(month: MonthKey): string {
  // Mediodía con offset fijo evita cualquier corrimiento de día al formatear.
  const date = new Date(`${month}-01T12:00:00-04:00`)
  const raw = new Intl.DateTimeFormat('es-CL', {
    month: 'long', year: 'numeric', timeZone: SANTIAGO,
  }).format(date)
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}

export function monthRange(month: MonthKey): { start: string; endExclusive: string } {
  return { start: `${month}-01`, endExclusive: `${shiftMonth(month, 1)}-01` }
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run src/data/monthNav.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/monthNav.ts src/data/monthNav.test.ts
git commit -m "feat(fase3b-ii): navegacion de meses (logica pura) y tipo MonthKey"
```

---

## Task 2: Hook useMonthTransactions + tipo MonthTx

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/useMonthTransactions.ts`
- Test: `src/data/useMonthTransactions.test.tsx`

**Interfaces:**
- Consumes: `monthRange` (Task 1); tipos `TxType`, `Channel`, `AccountType` (ya en `types.ts`).
- Produces:
  - `interface MonthTx { id: string; transactionDate: string; amount: number; type: TxType; channel: Channel | null; categoryName: string | null; accountName: string; accountType: AccountType }`
  - `mapMonthTxRow(row: Record<string, unknown>): MonthTx`
  - `useMonthTransactions(month: MonthKey): UseQueryResult<MonthTx[]>` (queryKey `['month-transactions', month]`).

- [ ] **Step 1: Escribir el test del mapper (falla)**

Create `src/data/useMonthTransactions.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { mapMonthTxRow } from './useMonthTransactions'

describe('mapMonthTxRow', () => {
  it('should_MapRowWithJoins_When_GivenDbRow', () => {
    const row = {
      id: 't1', transaction_date: '2026-07-12', amount: '12000', type: 'gasto',
      channel: 'wallet_pixel',
      categories: { name: 'Comida' },
      accounts: { name: 'BICE Visa', type: 'credit' },
    }

    expect(mapMonthTxRow(row)).toEqual({
      id: 't1', transactionDate: '2026-07-12', amount: 12000, type: 'gasto',
      channel: 'wallet_pixel', categoryName: 'Comida',
      accountName: 'BICE Visa', accountType: 'credit',
    })
  })

  it('should_NullCategory_When_CategoriesMissing', () => {
    const row = {
      id: 't2', transaction_date: '2026-07-01', amount: 900000, type: 'ingreso',
      channel: null, categories: null,
      accounts: { name: 'Santander', type: 'debit' },
    }

    const tx = mapMonthTxRow(row)

    expect(tx.categoryName).toBeNull()
    expect(tx.channel).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/data/useMonthTransactions.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Agregar el tipo en types.ts**

Add to `src/data/types.ts` (al final):

```ts
export interface MonthTx {
  id: string
  transactionDate: string
  amount: number
  type: TxType
  channel: Channel | null
  categoryName: string | null
  accountName: string
  accountType: AccountType
}
```

- [ ] **Step 4: Escribir el hook**

Create `src/data/useMonthTransactions.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { monthRange } from './monthNav'
import type { MonthKey, MonthTx, TxType, Channel, AccountType } from './types'

export function mapMonthTxRow(row: Record<string, unknown>): MonthTx {
  const categories = row.categories as { name: string } | null
  const accounts = row.accounts as { name: string; type: AccountType }
  return {
    id: String(row.id),
    transactionDate: String(row.transaction_date),
    amount: Number(row.amount ?? 0),
    type: row.type as TxType,
    channel: (row.channel as Channel | null) ?? null,
    categoryName: categories?.name ?? null,
    accountName: accounts.name,
    accountType: accounts.type,
  }
}

export function useMonthTransactions(month: MonthKey) {
  return useQuery({
    queryKey: ['month-transactions', month],
    queryFn: async (): Promise<MonthTx[]> => {
      const { start, endExclusive } = monthRange(month)
      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount, type, channel, categories(name), accounts!inner(name, type)')
        .gte('transaction_date', start)
        .lt('transaction_date', endExclusive)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return (data as unknown as Record<string, unknown>[]).map(mapMonthTxRow)
    },
  })
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/data/useMonthTransactions.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/data/types.ts src/data/useMonthTransactions.ts src/data/useMonthTransactions.test.tsx
git commit -m "feat(fase3b-ii): hook useMonthTransactions y tipo MonthTx"
```

---

## Task 3: Agregación de gasto por categoría (lógica pura)

**Files:**
- Modify: `src/data/types.ts`
- Create: `src/data/categorySpend.ts`
- Test: `src/data/categorySpend.test.ts`

**Interfaces:**
- Consumes: `MonthTx` (Task 2).
- Produces:
  - `interface CategorySpendSegment { label: string; amount: number; pct: number }`
  - `computeCategorySpend(txs: MonthTx[]): CategorySpendSegment[]`
  - `TOP_CATEGORIES` (constante, 6).

Reglas: solo `type='gasto'`; agrupa por `categoryName` (null → `'Sin categoría'`); ordena por monto desc; `pct` = monto / total_gastos * 100 (`0` si total 0, `pct` sin redondear); si hay más de `TOP_CATEGORIES` grupos, colapsa el sobrante en un único `'Otros'` (que va al final, con su monto y pct sumados).

- [ ] **Step 1: Escribir los tests (fallan)**

Create `src/data/categorySpend.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { computeCategorySpend } from './categorySpend'
import type { MonthTx } from './types'

function gasto(category: string | null, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryName: category,
    accountName: 'BICE', accountType: 'credit',
  }
}

describe('computeCategorySpend', () => {
  it('should_GroupSortAndComputePct_When_GivenGastos', () => {
    const result = computeCategorySpend([
      gasto('Comida', 60), gasto('Comida', 20), gasto('Ocio', 20),
    ])

    expect(result).toEqual([
      { label: 'Comida', amount: 80, pct: 80 },
      { label: 'Ocio', amount: 20, pct: 20 },
    ])
  })

  it('should_LabelNullCategoryAsSinCategoria', () => {
    const result = computeCategorySpend([gasto(null, 100)])

    expect(result[0].label).toBe('Sin categoría')
  })

  it('should_IgnoreNonGasto', () => {
    const income: MonthTx = { ...gasto('Sueldo', 1000), type: 'ingreso' }

    expect(computeCategorySpend([income, gasto('Comida', 50)])).toEqual([
      { label: 'Comida', amount: 50, pct: 100 },
    ])
  })

  it('should_CollapseIntoOtros_When_MoreThanTopCategories', () => {
    const txs = [
      gasto('A', 70), gasto('B', 60), gasto('C', 50), gasto('D', 40),
      gasto('E', 30), gasto('F', 20), gasto('G', 10), gasto('H', 5),
    ]

    const result = computeCategorySpend(txs)

    expect(result).toHaveLength(7) // 6 top + Otros
    expect(result[6]).toEqual({ label: 'Otros', amount: 15, pct: (15 / 285) * 100 })
  })

  it('should_ReturnEmpty_When_NoGastos', () => {
    expect(computeCategorySpend([])).toEqual([])
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/data/categorySpend.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Agregar el tipo en types.ts**

Add to `src/data/types.ts` (al final):

```ts
export interface CategorySpendSegment {
  label: string
  amount: number
  pct: number
}
```

- [ ] **Step 4: Escribir la lógica pura**

Create `src/data/categorySpend.ts`:

```ts
import type { MonthTx, CategorySpendSegment } from './types'

export const TOP_CATEGORIES = 6
const UNCATEGORIZED = 'Sin categoría'
const OTHER = 'Otros'

export function computeCategorySpend(txs: MonthTx[]): CategorySpendSegment[] {
  const gastos = txs.filter((t) => t.type === 'gasto')
  if (gastos.length === 0) return []

  const totals = new Map<string, number>()
  for (const t of gastos) {
    const label = t.categoryName ?? UNCATEGORIZED
    totals.set(label, (totals.get(label) ?? 0) + t.amount)
  }

  const total = gastos.reduce((sum, t) => sum + t.amount, 0)
  const sorted = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)

  const top = sorted.slice(0, TOP_CATEGORIES)
  const rest = sorted.slice(TOP_CATEGORIES)

  const toPct = (amount: number): number => (total === 0 ? 0 : (amount / total) * 100)
  const segments: CategorySpendSegment[] = top.map((s) => ({
    label: s.label, amount: s.amount, pct: toPct(s.amount),
  }))

  if (rest.length > 0) {
    const otherAmount = rest.reduce((sum, s) => sum + s.amount, 0)
    segments.push({ label: OTHER, amount: otherAmount, pct: toPct(otherAmount) })
  }

  return segments
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npx vitest run src/data/categorySpend.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/data/types.ts src/data/categorySpend.ts src/data/categorySpend.test.ts
git commit -m "feat(fase3b-ii): agregacion de gasto por categoria (logica pura)"
```

---

## Task 4: Geometría de la dona (lógica pura)

**Files:**
- Create: `src/data/donutGeometry.ts`
- Test: `src/data/donutGeometry.test.ts`

**Interfaces:**
- Consumes: `CategorySpendSegment` (Task 3).
- Produces:
  - `interface DonutDash { label: string; pct: number; dash: number; offset: number }`
  - `donutDashes(segments: CategorySpendSegment[], circumference: number): DonutDash[]`

Técnica: cada segmento es un `<circle>` con `stroke-dasharray = "${dash} ${circumference}"` y `stroke-dashoffset = offset`. `dash = pct/100 * circumference`; `offset = -(pctAcumuladoAntes/100 * circumference)` (negativo para avanzar en sentido horario desde arriba).

- [ ] **Step 1: Escribir los tests (fallan)**

Create `src/data/donutGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { donutDashes } from './donutGeometry'
import type { CategorySpendSegment } from './types'

function seg(label: string, pct: number): CategorySpendSegment {
  return { label, amount: pct, pct }
}

describe('donutDashes', () => {
  it('should_ComputeDashAndCumulativeOffset_When_GivenSegments', () => {
    const result = donutDashes([seg('A', 60), seg('B', 40)], 100)

    expect(result).toEqual([
      { label: 'A', pct: 60, dash: 60, offset: -0 },
      { label: 'B', pct: 40, dash: 40, offset: -60 },
    ])
  })

  it('should_ReturnEmpty_When_NoSegments', () => {
    expect(donutDashes([], 100)).toEqual([])
  })

  it('should_SumDashesToCircumference_When_SegmentsCoverAll', () => {
    const result = donutDashes([seg('A', 25), seg('B', 25), seg('C', 50)], 360)
    const totalDash = result.reduce((sum, d) => sum + d.dash, 0)

    expect(totalDash).toBeCloseTo(360)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npx vitest run src/data/donutGeometry.test.ts`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir la lógica pura**

Create `src/data/donutGeometry.ts`:

```ts
import type { CategorySpendSegment } from './types'

export interface DonutDash {
  label: string
  pct: number
  dash: number
  offset: number
}

export function donutDashes(
  segments: CategorySpendSegment[],
  circumference: number,
): DonutDash[] {
  let cumulativePct = 0
  return segments.map((s) => {
    const dash = (s.pct / 100) * circumference
    const offset = -((cumulativePct / 100) * circumference)
    cumulativePct += s.pct
    return { label: s.label, pct: s.pct, dash, offset }
  })
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run src/data/donutGeometry.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/donutGeometry.ts src/data/donutGeometry.test.ts
git commit -m "feat(fase3b-ii): geometria de la dona (logica pura)"
```

---

## Task 5: Componente MonthNav

**Files:**
- Create: `src/features/historial/MonthNav.tsx`
- Test: `src/features/historial/MonthNav.test.tsx`

**Interfaces:**
- Consumes: `shiftMonth`, `monthLabel` (Task 1), `MonthKey`.
- Produces: `MonthNav({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void })`.

- [ ] **Step 1: Escribir el test (falla)**

Create `src/features/historial/MonthNav.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthNav } from './MonthNav'

describe('MonthNav', () => {
  it('should_ShowMonthLabel', () => {
    render(<MonthNav month="2026-07" onChange={vi.fn()} />)

    expect(screen.getByText('Julio 2026')).toBeInTheDocument()
  })

  it('should_EmitPrevMonth_When_PrevClicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MonthNav month="2026-07" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /mes anterior/i }))

    expect(onChange).toHaveBeenCalledWith('2026-06')
  })

  it('should_EmitNextMonth_When_NextClicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MonthNav month="2026-07" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /mes siguiente/i }))

    expect(onChange).toHaveBeenCalledWith('2026-08')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/MonthNav.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir el componente**

Create `src/features/historial/MonthNav.tsx`:

```tsx
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { shiftMonth, monthLabel } from '../../data/monthNav'
import type { MonthKey } from '../../data/types'

export function MonthNav({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  return (
    <div className="flex items-center justify-between mt-4">
      <button aria-label="Mes anterior" onClick={() => onChange(shiftMonth(month, -1))}
        className="p-2 text-zinc-400 active:scale-[0.95]">
        <CaretLeft size={18} />
      </button>
      <span className="text-sm text-zinc-200">{monthLabel(month)}</span>
      <button aria-label="Mes siguiente" onClick={() => onChange(shiftMonth(month, 1))}
        className="p-2 text-zinc-400 active:scale-[0.95]">
        <CaretRight size={18} />
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/MonthNav.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/MonthNav.tsx src/features/historial/MonthNav.test.tsx
git commit -m "feat(fase3b-ii): componente MonthNav"
```

---

## Task 6: Componente CategoryDonut (SVG a mano)

**Files:**
- Create: `src/features/historial/CategoryDonut.tsx`
- Test: `src/features/historial/CategoryDonut.test.tsx`

**Interfaces:**
- Consumes: `donutDashes` (Task 4), `CategorySpendSegment` (Task 3).
- Produces:
  - `SEGMENT_COLORS: string[]`, `OTHER_COLOR: string`, `segmentColor(label: string, index: number): string` (exportados, reutilizados por la leyenda en Task 7).
  - `CategoryDonut({ segments }: { segments: CategorySpendSegment[] })`.

Técnica: un `<circle>` por segmento, `fill=none`, `stroke=color`, `strokeDasharray="${dash} ${CIRCUMFERENCE}"`, `strokeDashoffset={offset}`, todos con el mismo `r` y un `transform` de rotación −90° para arrancar arriba. `'Otros'` usa `OTHER_COLOR`; el resto toma `SEGMENT_COLORS[index]`.

- [ ] **Step 1: Escribir el test (falla)**

Create `src/features/historial/CategoryDonut.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CategoryDonut, segmentColor, OTHER_COLOR } from './CategoryDonut'
import type { CategorySpendSegment } from '../../data/types'

describe('segmentColor', () => {
  it('should_UseOtherColor_When_LabelIsOtros', () => {
    expect(segmentColor('Otros', 3)).toBe(OTHER_COLOR)
  })

  it('should_UsePaletteByIndex_When_RealCategory', () => {
    expect(segmentColor('Comida', 0)).not.toBe(OTHER_COLOR)
  })
})

describe('CategoryDonut', () => {
  it('should_RenderOneArcPerSegment', () => {
    const segments: CategorySpendSegment[] = [
      { label: 'Comida', amount: 80, pct: 80 },
      { label: 'Ocio', amount: 20, pct: 20 },
    ]

    const { container } = render(<CategoryDonut segments={segments} />)

    expect(container.querySelectorAll('circle[data-arc]')).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/CategoryDonut.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir el componente**

Create `src/features/historial/CategoryDonut.tsx`:

```tsx
import { donutDashes } from '../../data/donutGeometry'
import type { CategorySpendSegment } from '../../data/types'

// Paleta categórica validada con dataviz sobre la superficie oscura de la app (#0c0c0e).
// El WARN de CVD en banda-piso se mitiga con la leyenda (direct labels) en CategorySpendTab.
export const SEGMENT_COLORS = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767']
export const OTHER_COLOR = '#52525b'

export function segmentColor(label: string, index: number): string {
  if (label === 'Otros') return OTHER_COLOR
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]
}

const SIZE = 140
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function CategoryDonut({ segments }: { segments: CategorySpendSegment[] }) {
  const dashes = donutDashes(segments, CIRCUMFERENCE)

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-40 h-40 mx-auto mt-4"
      role="img" aria-label="Gasto por categoría">
      <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
        {dashes.map((d, i) => (
          <circle
            key={d.label}
            data-arc
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none"
            stroke={segmentColor(d.label, i)}
            strokeWidth={STROKE}
            strokeDasharray={`${d.dash} ${CIRCUMFERENCE}`}
            strokeDashoffset={d.offset}
          />
        ))}
      </g>
    </svg>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/CategoryDonut.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/CategoryDonut.tsx src/features/historial/CategoryDonut.test.tsx
git commit -m "feat(fase3b-ii): componente CategoryDonut (SVG a mano)"
```

---

## Task 7: Sub-tab Gasto (CategorySpendTab)

**Files:**
- Create: `src/features/historial/CategorySpendTab.tsx`
- Test: `src/features/historial/CategorySpendTab.test.tsx`

**Interfaces:**
- Consumes: `useMonthTransactions` (Task 2), `computeCategorySpend` (Task 3), `MonthNav` (Task 5), `CategoryDonut`/`segmentColor` (Task 6), `Skeleton`, `MoneyText`, `MonthKey`.
- Produces: `CategorySpendTab({ month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void })`.

Estados: loading (skeleton), error (inline + retry), empty (segments vacío → "Sin gastos este mes."), ok (dona + leyenda-lista: swatch de color + nombre + `MoneyText` + `pct` redondeado). El texto de la leyenda usa tokens zinc, el color va solo en el swatch.

- [ ] **Step 1: Escribir el test (falla)**

Create `src/features/historial/CategorySpendTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorySpendTab } from './CategorySpendTab'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import type { MonthTx } from '../../data/types'

vi.mock('../../data/useMonthTransactions')

function gasto(category: string, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryName: category,
    accountName: 'BICE', accountType: 'credit',
  }
}

beforeEach(() => vi.clearAllMocks())

describe('CategorySpendTab', () => {
  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: true, isError: false } as any)

    const { container } = render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should_ShowRetry_When_Error', async () => {
    const refetch = vi.fn()
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: true, refetch } as any)
    const user = userEvent.setup()

    render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(refetch).toHaveBeenCalled()
  })

  it('should_ShowCalmEmpty_When_NoGastos', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)

    render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText(/sin gastos este mes/i)).toBeInTheDocument()
  })

  it('should_RenderDonutAndLegend_When_HasGastos', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false, data: [gasto('Comida', 80), gasto('Ocio', 20)],
    } as any)

    const { container } = render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelectorAll('circle[data-arc]')).toHaveLength(2)
    expect(screen.getByText('Comida')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/CategorySpendTab.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir el componente**

Create `src/features/historial/CategorySpendTab.tsx`:

```tsx
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { computeCategorySpend } from '../../data/categorySpend'
import { MonthNav } from './MonthNav'
import { CategoryDonut, segmentColor } from './CategoryDonut'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import type { MonthKey } from '../../data/types'

export function CategorySpendTab(
  { month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void },
) {
  const txs = useMonthTransactions(month)
  const segments = computeCategorySpend(txs.data ?? [])

  return (
    <div>
      <MonthNav month={month} onChange={onMonthChange} />

      {txs.isLoading && <Skeleton className="h-48 w-full mt-4" />}

      {txs.isError && (
        <div className="mt-4">
          <p className="text-debt text-sm">No se pudo cargar el gasto. Reintentá.</p>
          <button onClick={() => txs.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">
            Reintentar
          </button>
        </div>
      )}

      {!txs.isLoading && !txs.isError && segments.length === 0 && (
        <p className="text-sm text-zinc-500 mt-6">Sin gastos este mes.</p>
      )}

      {!txs.isLoading && !txs.isError && segments.length > 0 && (
        <>
          <CategoryDonut segments={segments} />
          <ul className="mt-4">
            {segments.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 py-2 border-t border-ink-line">
                <span className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: segmentColor(s.label, i) }} />
                <span className="text-sm text-zinc-200 flex-1">{s.label}</span>
                <MoneyText value={s.amount} className="text-sm text-zinc-300" />
                <span className="text-[11px] text-zinc-500 w-10 text-right">{Math.round(s.pct)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/CategorySpendTab.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/CategorySpendTab.tsx src/features/historial/CategorySpendTab.test.tsx
git commit -m "feat(fase3b-ii): sub-tab Gasto (dona + leyenda por categoria)"
```

---

## Task 8: Sub-tab Movimientos (TransactionsTab)

**Files:**
- Create: `src/features/historial/TransactionsTab.tsx`
- Test: `src/features/historial/TransactionsTab.test.tsx`

**Interfaces:**
- Consumes: `useMonthTransactions` (Task 2), `MonthNav` (Task 5), `Skeleton`, `MoneyText`, `MonthTx`, `MonthKey`.
- Produces: `TransactionsTab({ month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void })`.

Filtros en cliente sobre las tx del mes: categoría (por `categoryName`), tipo (`TxType`), cuenta (por `accountName`). Cada `<select>` tiene la opción "Todas"/"Todos". Signo: `ingreso` positivo, resto negativo → mostrar con `MoneyText value={signedAmount}` usando `signed` y un valor negado para no-ingreso. Estados: loading/empty ("Sin movimientos con estos filtros.")/error.

- [ ] **Step 1: Escribir el test (falla)**

Create `src/features/historial/TransactionsTab.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionsTab } from './TransactionsTab'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import type { MonthTx } from '../../data/types'

vi.mock('../../data/useMonthTransactions')

function tx(partial: Partial<MonthTx>): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-12', amount: 12000,
    type: 'gasto', channel: null, categoryName: 'Comida',
    accountName: 'BICE', accountType: 'credit', ...partial,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('TransactionsTab', () => {
  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: true, isError: false } as any)

    const { container } = render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should_ShowRetry_When_Error', async () => {
    const refetch = vi.fn()
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: true, refetch } as any)
    const user = userEvent.setup()

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(refetch).toHaveBeenCalled()
  })

  // Nota: los nombres de categoría aparecen dos veces (fila de la lista y <option>
  // del filtro), así que las aserciones se acotan a la lista con data-testid.
  it('should_ListAllTx_When_NoFilterSelected', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ categoryName: 'Comida' }), tx({ categoryName: 'Ocio', accountName: 'Santander', accountType: 'debit' })],
    } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getAllByTestId('tx-row')).toHaveLength(2)
  })

  it('should_FilterByCategory_When_CategorySelected', async () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ categoryName: 'Comida' }), tx({ categoryName: 'Ocio' })],
    } as any)
    const user = userEvent.setup()

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Ocio')

    const rows = screen.getAllByTestId('tx-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Ocio')).toBeInTheDocument()
  })

  it('should_ShowCalmEmpty_When_NoTxMatch', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText(/sin movimientos/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/TransactionsTab.test.tsx`
Expected: FAIL (módulo no encontrado).

- [ ] **Step 3: Escribir el componente**

Create `src/features/historial/TransactionsTab.tsx`:

```tsx
import { useState } from 'react'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { MonthNav } from './MonthNav'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import type { MonthKey, MonthTx, TxType } from '../../data/types'

const ALL = 'todas'
const TYPE_LABELS: Record<TxType, string> = {
  ingreso: 'Ingreso', gasto: 'Gasto', pago_tarjeta: 'Pago tarjeta',
  transferencia_interna: 'Transferencia',
}

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))].sort()
}

// Signo de exhibición: solo el ingreso suma; el resto resta.
function displayAmount(tx: MonthTx): number {
  return tx.type === 'ingreso' ? tx.amount : -tx.amount
}

export function TransactionsTab(
  { month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void },
) {
  const txs = useMonthTransactions(month)
  const [category, setCategory] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [account, setAccount] = useState(ALL)

  const all = txs.data ?? []
  const categories = uniqueSorted(all.map((t) => t.categoryName))
  const accounts = uniqueSorted(all.map((t) => t.accountName))
  const types = uniqueSorted(all.map((t) => t.type))

  const visible = all.filter((t) =>
    (category === ALL || t.categoryName === category) &&
    (type === ALL || t.type === type) &&
    (account === ALL || t.accountName === account),
  )

  return (
    <div>
      <MonthNav month={month} onChange={onMonthChange} />

      {txs.isLoading && <Skeleton className="h-48 w-full mt-4" />}

      {txs.isError && (
        <div className="mt-4">
          <p className="text-debt text-sm">No se pudieron cargar los movimientos. Reintentá.</p>
          <button onClick={() => txs.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">
            Reintentar
          </button>
        </div>
      )}

      {!txs.isLoading && !txs.isError && (
        <>
          <div className="flex gap-2 mt-4 text-sm">
            <label className="sr-only" htmlFor="f-cat">Categoría</label>
            <select id="f-cat" aria-label="Categoría" value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-type">Tipo</label>
            <select id="f-type" aria-label="Tipo" value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todos</option>
              {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t as TxType]}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-acc">Cuenta</label>
            <select id="f-acc" aria-label="Cuenta" value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todas</option>
              {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-zinc-500 mt-6">Sin movimientos con estos filtros.</p>
          ) : (
            <div className="mt-3" data-testid="tx-list">
              {visible.map((t) => (
                <div key={t.id} data-testid="tx-row"
                  className="py-3 border-t border-ink-line flex justify-between items-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-zinc-200">{t.categoryName ?? TYPE_LABELS[t.type]}</span>
                    <span className="text-[11px] text-zinc-500">{t.transactionDate} · {t.accountName}</span>
                  </div>
                  <MoneyText value={displayAmount(t)} signed className="text-sm text-zinc-300" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/TransactionsTab.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/historial/TransactionsTab.tsx src/features/historial/TransactionsTab.test.tsx
git commit -m "feat(fase3b-ii): sub-tab Movimientos (lista con filtros)"
```

---

## Task 9: Refactor HistorialScreen a sub-tabs + extraer SlrdTab

**Files:**
- Create: `src/features/historial/SlrdTab.tsx`
- Modify: `src/features/historial/HistorialScreen.tsx`
- Modify: `src/features/historial/HistorialScreen.test.tsx`

**Interfaces:**
- Consumes: `CategorySpendTab` (Task 7), `TransactionsTab` (Task 8), `currentMonthKey` (Task 1), y todo lo que hoy usa `HistorialScreen` (movido a `SlrdTab`).
- Produces: `SlrdTab()` (sin props) con el contenido SLRD actual; `HistorialScreen()` con sub-tabs y `selectedMonth` compartido.

- [ ] **Step 1: Extraer SlrdTab (mover el contenido actual, sin cambiar lógica)**

Create `src/features/historial/SlrdTab.tsx` con el cuerpo actual del SLRD (queda idéntico al que hoy vive en `HistorialScreen`, solo cambia el contenedor externo):

```tsx
import { useState } from 'react'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import { filterByRange, type ChartRange } from '../../data/chartScale'
import { SlrdLineChart } from './SlrdLineChart'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'

const MIN_POINTS_FOR_CHART = 2
const RANGES: { value: ChartRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'Todo' },
]

export function SlrdTab() {
  const history = useSlrdHistory()
  const [range, setRange] = useState<ChartRange>('30d')

  const points = history.data ?? []
  const visible = filterByRange(points, range, new Date())

  return (
    <div>
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
        <div className="mt-4">
          <p className="text-sm text-zinc-500">
            El historial se arma solo: guardamos el SLRD de cada día. Volvé mañana para ver la tendencia.
          </p>
          {points.length === 1 && (
            <p className="text-sm text-zinc-400 mt-2">
              SLRD de hoy: <MoneyText value={points[0].slrdInmediato} />
            </p>
          )}
        </div>
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
    </div>
  )
}
```

- [ ] **Step 2: Reescribir el test de HistorialScreen (falla)**

Replace `src/features/historial/HistorialScreen.test.tsx` con:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistorialScreen } from './HistorialScreen'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import { useMonthTransactions } from '../../data/useMonthTransactions'

vi.mock('../../data/useSlrdHistory')
vi.mock('../../data/useMonthTransactions')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSlrdHistory).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
})

describe('HistorialScreen', () => {
  it('should_ShowSlrdTabByDefault', () => {
    render(<HistorialScreen />)

    // El empty del SLRD (default) menciona el historial que se arma solo.
    expect(screen.getByText(/el historial se arma solo/i)).toBeInTheDocument()
  })

  it('should_SwitchToGastoTab_When_TabClicked', async () => {
    const user = userEvent.setup()
    render(<HistorialScreen />)

    await user.click(screen.getByRole('button', { name: 'Gasto' }))

    expect(screen.getByText(/sin gastos este mes/i)).toBeInTheDocument()
  })

  it('should_SwitchToMovimientosTab_When_TabClicked', async () => {
    const user = userEvent.setup()
    render(<HistorialScreen />)

    await user.click(screen.getByRole('button', { name: 'Movimientos' }))

    expect(screen.getByText(/sin movimientos/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `npx vitest run src/features/historial/HistorialScreen.test.tsx`
Expected: FAIL (sub-tabs aún no existen).

- [ ] **Step 4: Reescribir HistorialScreen con sub-tabs**

Replace `src/features/historial/HistorialScreen.tsx` con:

```tsx
import { useState } from 'react'
import { SlrdTab } from './SlrdTab'
import { CategorySpendTab } from './CategorySpendTab'
import { TransactionsTab } from './TransactionsTab'
import { currentMonthKey } from '../../data/monthNav'
import type { MonthKey } from '../../data/types'

type SubTab = 'slrd' | 'gasto' | 'movimientos'
const TABS: { value: SubTab; label: string }[] = [
  { value: 'slrd', label: 'SLRD' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'movimientos', label: 'Movimientos' },
]

export function HistorialScreen() {
  const [tab, setTab] = useState<SubTab>('slrd')
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey(new Date()))

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">historial</p>

      <div className="flex gap-2 mt-3">
        {TABS.map((t) => (
          <button key={t.value} onClick={() => setTab(t.value)}
            className={`rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] ${
              tab === t.value ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'slrd' && <SlrdTab />}
      {tab === 'gasto' && <CategorySpendTab month={month} onMonthChange={setMonth} />}
      {tab === 'movimientos' && <TransactionsTab month={month} onMonthChange={setMonth} />}
    </section>
  )
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `npx vitest run src/features/historial/HistorialScreen.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 6: Correr toda la suite + typecheck + lint**

Run: `npx tsc --noEmit && npx vitest run && npx oxlint`
Expected: tsc sin errores; toda la suite PASS; oxlint sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add src/features/historial/SlrdTab.tsx src/features/historial/HistorialScreen.tsx src/features/historial/HistorialScreen.test.tsx
git commit -m "feat(fase3b-ii): HistorialScreen con sub-tabs SLRD/Gasto/Movimientos"
```

---

## Verificación final (antes de finishing-a-development-branch)

- [ ] `npx tsc --noEmit` sin errores.
- [ ] `npx vitest run` — toda la suite en verde.
- [ ] `npx oxlint` sin errores nuevos.
- [ ] `npm run build` sin dependencias nuevas de gráficos.
- [ ] Historial navegable con sub-tabs SLRD/Gasto/Movimientos; el SLRD de 3b-i intacto; dona por mes con leyenda; lista con filtros categoría/tipo/cuenta; los 3 estados por sub-tab.
