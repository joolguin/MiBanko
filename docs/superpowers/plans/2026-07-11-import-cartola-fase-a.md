# Import de cartola — Fase A (BICE Visa CSV) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar la cartola CSV de la BICE Visa Gold como gastos del ciclo actual que bajan el SLRD, con una vista previa editable y control total del usuario.

**Architecture:** Un pipeline compartido con un adaptador de parseo por fuente. Fase A implementa el pipeline completo (parser → preview editable → dedup → insert en lote) con el único adaptador BICE Visa (CSV). El parser produce un tipo neutro `RawMovement[]`; la pantalla no conoce columnas del banco. La cartola Santander (PDF) es Fase B y no se toca aquí.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind, @tanstack/react-query, react-router-dom, papaparse (nueva), Vitest + Testing Library, Supabase.

## Global Constraints

- Montos: enteros CLP (`numeric(12,0)`), sin decimales. Se guardan como valor absoluto; `type` distingue signo.
- Todo acceso a datos vía hooks en `src/data/`; ningún componente llama a `supabase` directo.
- Tests con Vitest + Testing Library, patrón AAA, nombres `should_X_When_Y`.
- La dependencia `papaparse` se carga solo dentro del chunk de import (la ruta `/importar` ya es lazy por el code-splitting existente).
- `transactions.source='import'` requiere la migración `0008`; **tras migrar, regenerar `src/types/db.ts`** o el build se rompe en silencio.
- BICE Visa = cuenta `type='credit'`. Gastos del ciclo actual → `billing_cycle_id = null` → bajan el SLRD.
- La suite existente (124 tests) debe quedar verde; cada task agrega los suyos.

---

### Task 1: Migración `source='import'` + regenerar tipos

**Files:**
- Create: `supabase/migrations/0008_source_import.sql`
- Modify (regenerado): `src/types/db.ts`

**Interfaces:**
- Produces: el valor `'import'` como `source` válido en `transactions`.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/0008_source_import.sql`:

```sql
-- Permite marcar transacciones importadas desde cartola (source='import'),
-- distinguiéndolas de las manuales y las del cron de suscripciones.
alter table public.transactions
  drop constraint if exists transactions_source_check;

alter table public.transactions
  add constraint transactions_source_check
  check (source in ('manual', 'auto', 'import'));
```

- [ ] **Step 2: Aplicar la migración al proyecto Supabase**

Usa el MCP de Supabase (`apply_migration` con name `0008_source_import` y el SQL de arriba) o la CLI:

Run: `supabase db push`
Expected: la migración aplica sin error; `list_migrations` muestra `0008_source_import`.

- [ ] **Step 3: Regenerar los tipos de Supabase**

Usa el MCP (`generate_typescript_types`) o la CLI:

Run: `supabase gen types typescript --linked > src/types/db.ts`
Expected: `src/types/db.ts` se actualiza; el enum/campo `source` de `transactions` ahora admite `'import'`.

- [ ] **Step 4: Verificar build verde**

Run: `npm run build`
Expected: `tsc -b` y `vite build` sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0008_source_import.sql src/types/db.ts
git commit -m "feat(db): permite source='import' en transactions (migracion 0008)"
```

---

### Task 2: Tipos neutros + parser BICE Visa (CSV)

**Files:**
- Create: `src/parsers/types.ts`
- Create: `src/parsers/biceVisaCsv.ts`
- Create: `src/parsers/biceVisaCsv.test.ts`
- Create: `src/parsers/__fixtures__/bice-visa-sample.csv`
- Modify: `package.json` (dependencia `papaparse` + `@types/papaparse`)

**Interfaces:**
- Produces:
  - `type CartolaSource = 'bice_visa' | 'santander_vista'`
  - `interface RawMovement { date: string; amount: number; description: string; kind: 'gasto'|'ingreso'; bankCategory?: string; installments?: string; pending?: boolean }`
  - `interface CartolaParser { parse(file: File): Promise<RawMovement[]> }`
  - `parseBiceAmount(raw: string): number`
  - `parseBiceDate(raw: string): string`  // 'DD/MM/YYYY' -> 'YYYY-MM-DD'
  - `extractBiceRows(rows: string[][]): RawMovement[]`
  - `parseBiceVisaCsv(file: File): Promise<RawMovement[]>`

- [ ] **Step 1: Instalar la dependencia**

Run: `npm install papaparse && npm install -D @types/papaparse`
Expected: ambas aparecen en `package.json`.

- [ ] **Step 2: Crear el fixture con la estructura real de la cartola**

Create `src/parsers/__fixtures__/bice-visa-sample.csv`:

```csv
"","","","","","","","","",""
"","","","","Movimientos Nacionales de Tarjeta de Crédito:","","","","",""
"","","","","Nº **** **** **** 0000","","","","",""
"","","","","","","","","",""
"","","","","Total Abonos","Total Cargos","","","",""
"","","","","0 CLP","11.220 CLP","","","",""
"","","","","","","","","",""
"","Fecha","Categoria","Detalle","","","","","Cuotas","Monto $"
"","10/07/2026","Hogar","* GOOGLE PLAY YOUTUBE GO COMPRAS","","","","","1 de 1","5,500"
"","10/07/2026","Autos Y Transporte","* ROSARIO NORTE COMPRAS","","","","","1 de 1","2,470"
"","07/07/2026","Autos Y Transporte","ROSARIO NORTE COMPRAS","","","","","1 de 1","3,250"
"","* Movimientos sujetos a confirmación por los comercios respectivos.","","","","","","","",""
```

- [ ] **Step 3: Escribir los tests que fallan**

Create `src/parsers/types.ts` con solo las interfaces (para poder importarlas):

```ts
export type CartolaSource = 'bice_visa' | 'santander_vista'

export interface RawMovement {
  date: string                 // 'YYYY-MM-DD'
  amount: number               // entero CLP, valor absoluto
  description: string
  kind: 'gasto' | 'ingreso'
  bankCategory?: string        // string crudo del banco, sin mapear
  installments?: string        // "N de M" si M>1
  pending?: boolean            // venía con "* " (sujeto a confirmación)
}

export interface CartolaParser {
  parse(file: File): Promise<RawMovement[]>
}
```

Create `src/parsers/biceVisaCsv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import {
  parseBiceAmount, parseBiceDate, extractBiceRows, parseBiceVisaCsv,
} from './biceVisaCsv'

const fixtureText = readFileSync(
  join(__dirname, '__fixtures__', 'bice-visa-sample.csv'), 'utf-8',
)

describe('parseBiceAmount', () => {
  it('should_TreatCommaAsThousands_When_ParsingMonto', () => {
    expect(parseBiceAmount('5,500')).toBe(5500)
    expect(parseBiceAmount('11.220 CLP')).toBe(11220)
    expect(parseBiceAmount('')).toBe(0)
  })
})

describe('parseBiceDate', () => {
  it('should_ConvertToIso_When_GivenDdMmYyyy', () => {
    expect(parseBiceDate('10/07/2026')).toBe('2026-07-10')
  })
})

describe('extractBiceRows', () => {
  it('should_ReturnMovements_When_GivenParsedMatrix', () => {
    const matrix = Papa.parse<string[]>(fixtureText, { skipEmptyLines: false }).data

    const rows = extractBiceRows(matrix)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      date: '2026-07-10', amount: 5500,
      description: 'GOOGLE PLAY YOUTUBE GO COMPRAS', kind: 'gasto',
      bankCategory: 'Hogar', installments: undefined, pending: true,
    })
    expect(rows[2]).toEqual({
      date: '2026-07-07', amount: 3250,
      description: 'ROSARIO NORTE COMPRAS', kind: 'gasto',
      bankCategory: 'Autos Y Transporte', installments: undefined, pending: undefined,
    })
  })

  it('should_StopAtFooter_When_FechaIsNotADate', () => {
    const matrix = Papa.parse<string[]>(fixtureText, { skipEmptyLines: false }).data
    const rows = extractBiceRows(matrix)
    // el footer "* Movimientos sujetos..." no debe colarse como movimiento
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true)
  })
})

describe('parseBiceVisaCsv', () => {
  it('should_ParseFile_When_GivenCartolaCsv', async () => {
    const file = new File([fixtureText], 'cartola.csv', { type: 'text/csv' })

    const rows = await parseBiceVisaCsv(file)

    expect(rows).toHaveLength(3)
    expect(rows[0].amount).toBe(5500)
  })
})
```

- [ ] **Step 4: Correr los tests para verificar que fallan**

Run: `npm run test -- src/parsers/biceVisaCsv.test.ts`
Expected: FAIL — `extractBiceRows`/`parseBiceVisaCsv` no existen aún.

- [ ] **Step 5: Implementar el parser**

Create `src/parsers/biceVisaCsv.ts`:

```ts
import Papa from 'papaparse'
import type { RawMovement } from './types'

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/
const NO_CUOTAS = '1 de 1'

export function parseBiceAmount(raw: string): number {
  return Number(raw.replace(/[^\d]/g, '')) || 0
}

export function parseBiceDate(raw: string): string {
  const [dd, mm, yyyy] = raw.split('/')
  return `${yyyy}-${mm}-${dd}`
}

export function extractBiceRows(rows: string[][]): RawMovement[] {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() === 'Fecha'))
  if (headerIdx === -1) return []

  const header = rows[headerIdx].map((c) => c.trim())
  const col = {
    fecha: header.indexOf('Fecha'),
    categoria: header.indexOf('Categoria'),
    detalle: header.indexOf('Detalle'),
    cuotas: header.indexOf('Cuotas'),
    monto: header.findIndex((c) => c.startsWith('Monto')),
  }

  const out: RawMovement[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const fecha = (rows[i][col.fecha] ?? '').trim()
    if (!DATE_RE.test(fecha)) break

    const detalleRaw = (rows[i][col.detalle] ?? '').trim()
    const cuotas = (rows[i][col.cuotas] ?? '').trim()
    const bankCategory = (rows[i][col.categoria] ?? '').trim()

    out.push({
      date: parseBiceDate(fecha),
      amount: parseBiceAmount(rows[i][col.monto] ?? ''),
      description: detalleRaw.replace(/^\*\s*/, ''),
      kind: 'gasto',
      bankCategory: bankCategory || undefined,
      installments: cuotas && cuotas !== NO_CUOTAS ? cuotas : undefined,
      pending: detalleRaw.startsWith('*') || undefined,
    })
  }
  return out
}

export async function parseBiceVisaCsv(file: File): Promise<RawMovement[]> {
  const text = await file.text()
  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: false })
  return extractBiceRows(data)
}
```

- [ ] **Step 6: Correr los tests para verificar que pasan**

Run: `npm run test -- src/parsers/biceVisaCsv.test.ts`
Expected: PASS (todos).

- [ ] **Step 7: Commit**

```bash
git add src/parsers package.json package-lock.json
git commit -m "feat(import): parser de cartola BICE Visa (CSV) a RawMovement"
```

---

### Task 3: Mapeo de categoría del banco

**Files:**
- Create: `src/features/import/bankCategoryMap.ts`
- Create: `src/features/import/bankCategoryMap.test.ts`

**Interfaces:**
- Produces: `mapBankCategory(bankCategory: string | undefined): string | undefined` — devuelve el **nombre** de una categoría de la app, o `undefined`.

- [ ] **Step 1: Escribir el test que falla**

Create `src/features/import/bankCategoryMap.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapBankCategory } from './bankCategoryMap'

describe('mapBankCategory', () => {
  it('should_MapKnownBankCategory_When_Recognized', () => {
    expect(mapBankCategory('Autos Y Transporte')).toBe('Transporte')
    expect(mapBankCategory('supermercados')).toBe('Comida')
  })

  it('should_ReturnUndefined_When_UnknownOrEmpty', () => {
    expect(mapBankCategory('Hogar')).toBeUndefined()
    expect(mapBankCategory(undefined)).toBeUndefined()
    expect(mapBankCategory('')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- src/features/import/bankCategoryMap.test.ts`
Expected: FAIL — `mapBankCategory` no existe.

- [ ] **Step 3: Implementar el mapeo**

Create `src/features/import/bankCategoryMap.ts`:

```ts
// Traduce la categoría cruda de la cartola BICE a una categoría de la app.
// Solo mapea las inequívocas; el resto queda sin sugerencia (el usuario asigna
// en la preview). Diccionario extensible a medida que aparezcan más categorías.
const BANK_TO_APP: Record<string, string> = {
  'autos y transporte': 'Transporte',
  'restaurantes': 'Comida',
  'supermercados': 'Comida',
  'alimentación': 'Comida',
  'entretención': 'Hobbies',
  'entretenimiento': 'Hobbies',
}

export function mapBankCategory(bankCategory: string | undefined): string | undefined {
  if (!bankCategory) return undefined
  return BANK_TO_APP[bankCategory.trim().toLowerCase()]
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- src/features/import/bankCategoryMap.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/import/bankCategoryMap.ts src/features/import/bankCategoryMap.test.ts
git commit -m "feat(import): mapeo de categoria del banco BICE a categoria de la app"
```

---

### Task 4: Hook de preview (tx existentes para dedup)

**Files:**
- Create: `src/data/useImportPreview.ts`
- Create: `src/data/useImportPreview.test.ts`

**Interfaces:**
- Produces:
  - `interface ExistingTx { transactionDate: string; amount: number; description: string | null }`
  - `interface DateRange { from: string; to: string }`
  - `mapExistingTxRow(row): ExistingTx` (pura)
  - `useImportPreview(accountId: string | undefined, range: DateRange | null)` — query de tx existentes de la cuenta en el rango.

- [ ] **Step 1: Escribir el test que falla (función pura)**

Create `src/data/useImportPreview.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mapExistingTxRow } from './useImportPreview'

describe('mapExistingTxRow', () => {
  it('should_MapDbRow_When_GivenExistingTransaction', () => {
    const row = { transaction_date: '2026-07-10', amount: '5500', description: 'Google Play' }

    expect(mapExistingTxRow(row)).toEqual({
      transactionDate: '2026-07-10', amount: 5500, description: 'Google Play',
    })
  })

  it('should_KeepNullDescription_When_Missing', () => {
    const row = { transaction_date: '2026-07-01', amount: 3250, description: null }
    expect(mapExistingTxRow(row).description).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- src/data/useImportPreview.test.ts`
Expected: FAIL — `mapExistingTxRow` no existe.

- [ ] **Step 3: Implementar el hook + la función pura**

Create `src/data/useImportPreview.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ExistingTx {
  transactionDate: string
  amount: number
  description: string | null
}

export interface DateRange {
  from: string
  to: string
}

export function mapExistingTxRow(
  row: { transaction_date: string; amount: string | number; description: string | null },
): ExistingTx {
  return {
    transactionDate: row.transaction_date,
    amount: Number(row.amount),
    description: row.description,
  }
}

export function useImportPreview(accountId: string | undefined, range: DateRange | null) {
  return useQuery({
    queryKey: ['import-preview', accountId, range?.from, range?.to],
    enabled: !!accountId && !!range,
    queryFn: async (): Promise<ExistingTx[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('transaction_date, amount, description')
        .eq('account_id', accountId!)
        .gte('transaction_date', range!.from)
        .lte('transaction_date', range!.to)
      if (error) throw error
      return (data ?? []).map(mapExistingTxRow)
    },
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- src/data/useImportPreview.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/useImportPreview.ts src/data/useImportPreview.test.ts
git commit -m "feat(import): hook de tx existentes para deteccion de duplicados"
```

---

### Task 5: Detección de duplicados

**Files:**
- Create: `src/features/import/importDedup.ts`
- Create: `src/features/import/importDedup.test.ts`

**Interfaces:**
- Consumes: `RawMovement` (de `src/parsers/types`), `ExistingTx` (de `src/data/useImportPreview`).
- Produces: `flagDuplicates(movements: RawMovement[], existing: ExistingTx[]): boolean[]` — array paralelo; `true` = probable duplicado.

- [ ] **Step 1: Escribir el test que falla**

Create `src/features/import/importDedup.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { flagDuplicates } from './importDedup'
import type { RawMovement } from '../../parsers/types'
import type { ExistingTx } from '../../data/useImportPreview'

function mov(date: string, amount: number, description: string): RawMovement {
  return { date, amount, description, kind: 'gasto' }
}

describe('flagDuplicates', () => {
  it('should_FlagRow_When_MatchesExistingByDateAmountDescription', () => {
    const movements = [mov('2026-07-10', 5500, 'Google Play'), mov('2026-07-07', 3250, 'Rosario Norte')]
    const existing: ExistingTx[] = [{ transactionDate: '2026-07-10', amount: 5500, description: 'GOOGLE PLAY' }]

    expect(flagDuplicates(movements, existing)).toEqual([true, false])
  })

  it('should_NotFlag_When_AmountOrDateDiffers', () => {
    const movements = [mov('2026-07-10', 5500, 'Google Play')]
    const existing: ExistingTx[] = [
      { transactionDate: '2026-07-10', amount: 5501, description: 'Google Play' },
      { transactionDate: '2026-07-11', amount: 5500, description: 'Google Play' },
    ]

    expect(flagDuplicates(movements, existing)).toEqual([false])
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- src/features/import/importDedup.test.ts`
Expected: FAIL — `flagDuplicates` no existe.

- [ ] **Step 3: Implementar la detección**

Create `src/features/import/importDedup.ts`:

```ts
import type { RawMovement } from '../../parsers/types'
import type { ExistingTx } from '../../data/useImportPreview'

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function flagDuplicates(movements: RawMovement[], existing: ExistingTx[]): boolean[] {
  return movements.map((m) =>
    existing.some((e) =>
      e.transactionDate === m.date &&
      e.amount === m.amount &&
      norm(e.description) === norm(m.description),
    ),
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- src/features/import/importDedup.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/import/importDedup.ts src/features/import/importDedup.test.ts
git commit -m "feat(import): deteccion de duplicados por fecha+monto+glosa"
```

---

### Task 6: Hook de insert en lote

**Files:**
- Create: `src/data/useImportTransactions.ts`
- Create: `src/data/useImportTransactions.test.ts`

**Interfaces:**
- Produces:
  - `interface ImportRow { date: string; amount: number; description: string; kind: 'gasto'|'ingreso'; categoryId: string | null }`
  - `interface ImportPayload { accountId: string; billingCycleId: string | null; rows: ImportRow[] }`
  - `interface TransactionInsert { account_id; type; amount; transaction_date; channel: null; category_id; description; billing_cycle_id; source: 'import' }`
  - `buildImportInserts(payload: ImportPayload): TransactionInsert[]` (pura)
  - `useImportTransactions()` — mutación de insert en lote.

- [ ] **Step 1: Escribir el test que falla (función pura)**

Create `src/data/useImportTransactions.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildImportInserts, type ImportPayload } from './useImportTransactions'

describe('buildImportInserts', () => {
  it('should_BuildInsertRows_When_GivenPayload', () => {
    const payload: ImportPayload = {
      accountId: 'acc-bice', billingCycleId: null,
      rows: [
        { date: '2026-07-10', amount: 5500, description: 'Google Play', kind: 'gasto', categoryId: 'cat-hobbies' },
        { date: '2026-07-07', amount: 3250, description: 'Rosario Norte', kind: 'gasto', categoryId: null },
      ],
    }

    const inserts = buildImportInserts(payload)

    expect(inserts).toHaveLength(2)
    expect(inserts[0]).toEqual({
      account_id: 'acc-bice', type: 'gasto', amount: 5500,
      transaction_date: '2026-07-10', channel: null, category_id: 'cat-hobbies',
      description: 'Google Play', billing_cycle_id: null, source: 'import',
    })
    expect(inserts[1].category_id).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- src/data/useImportTransactions.test.ts`
Expected: FAIL — `buildImportInserts` no existe.

- [ ] **Step 3: Implementar el hook + la función pura**

Create `src/data/useImportTransactions.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ImportRow {
  date: string
  amount: number
  description: string
  kind: 'gasto' | 'ingreso'
  categoryId: string | null
}

export interface ImportPayload {
  accountId: string
  billingCycleId: string | null
  rows: ImportRow[]
}

export interface TransactionInsert {
  account_id: string
  type: 'gasto' | 'ingreso'
  amount: number
  transaction_date: string
  channel: null
  category_id: string | null
  description: string
  billing_cycle_id: string | null
  source: 'import'
}

export function buildImportInserts(payload: ImportPayload): TransactionInsert[] {
  return payload.rows.map((r) => ({
    account_id: payload.accountId,
    type: r.kind,
    amount: r.amount,
    transaction_date: r.date,
    channel: null,
    category_id: r.categoryId,
    description: r.description,
    billing_cycle_id: payload.billingCycleId,
    source: 'import',
  }))
}

export function useImportTransactions() {
  const qc = useQueryClient()
  return useMutation<void, Error, ImportPayload>({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('transactions').insert(buildImportInserts(payload))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['month-transactions'] })
      qc.invalidateQueries({ queryKey: ['slrd-history'] })
    },
  })
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- src/data/useImportTransactions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/useImportTransactions.ts src/data/useImportTransactions.test.ts
git commit -m "feat(import): mutacion de insert en lote (source='import')"
```

---

### Task 7: Tabla de vista previa editable

**Files:**
- Create: `src/features/import/PreviewTable.tsx`
- Create: `src/features/import/PreviewTable.test.tsx`

**Interfaces:**
- Consumes: `Category` (de `src/data/types`).
- Produces:
  - `interface PreviewRow { date: string; description: string; amount: number; kind: 'gasto'|'ingreso'; categoryId: string | null; selected: boolean; isDuplicate: boolean; installments?: string }`
  - `PreviewTable` con props `{ rows: PreviewRow[]; categories: Category[]; onChange: (index: number, patch: Partial<PreviewRow>) => void; onToggleAll: (selected: boolean) => void; onBulkCategory: (categoryId: string) => void }`

- [ ] **Step 1: Escribir el test que falla**

Create `src/features/import/PreviewTable.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreviewTable, type PreviewRow } from './PreviewTable'
import type { Category } from '../../data/types'

const categories: Category[] = [
  { id: 'cat-comida', name: 'Comida' },
  { id: 'cat-transporte', name: 'Transporte' },
]

function rows(): PreviewRow[] {
  return [
    { date: '2026-07-10', description: 'Google Play', amount: 5500, kind: 'gasto', categoryId: null, selected: true, isDuplicate: false },
    { date: '2026-07-07', description: 'Rosario Norte', amount: 3250, kind: 'gasto', categoryId: 'cat-transporte', selected: false, isDuplicate: true },
  ]
}

describe('PreviewTable', () => {
  it('should_RenderRowsAndDuplicateBadge_When_Given', () => {
    render(<PreviewTable rows={rows()} categories={categories} onChange={vi.fn()} onToggleAll={vi.fn()} onBulkCategory={vi.fn()} />)

    expect(screen.getByText('Google Play')).toBeInTheDocument()
    expect(screen.getByText(/posible duplicado/i)).toBeInTheDocument()
  })

  it('should_CallOnChange_When_TogglingRow', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PreviewTable rows={rows()} categories={categories} onChange={onChange} onToggleAll={vi.fn()} onBulkCategory={vi.fn()} />)

    await user.click(screen.getAllByRole('checkbox')[1]) // primera fila de datos

    expect(onChange).toHaveBeenCalledWith(0, { selected: false })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- src/features/import/PreviewTable.test.tsx`
Expected: FAIL — `PreviewTable` no existe.

- [ ] **Step 3: Implementar la tabla**

Create `src/features/import/PreviewTable.tsx`:

```tsx
import type { Category } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'

export interface PreviewRow {
  date: string
  description: string
  amount: number
  kind: 'gasto' | 'ingreso'
  categoryId: string | null
  selected: boolean
  isDuplicate: boolean
  installments?: string
}

interface Props {
  rows: PreviewRow[]
  categories: Category[]
  onChange: (index: number, patch: Partial<PreviewRow>) => void
  onToggleAll: (selected: boolean) => void
  onBulkCategory: (categoryId: string) => void
}

export function PreviewTable({ rows, categories, onChange, onToggleAll, onBulkCategory }: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => r.selected)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
          Marcar todas
        </label>
        <select defaultValue="" onChange={(e) => e.target.value && onBulkCategory(e.target.value)}
          className="bg-transparent border border-ink-line rounded-lg px-2 py-1">
          <option value="">Categoría en lote…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 border-t border-ink-line py-2">
          <input type="checkbox" checked={r.selected} onChange={(e) => onChange(i, { selected: e.target.checked })} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 truncate">{r.description}</p>
            <p className="text-[11px] text-zinc-500">
              {r.date}
              {r.installments && <span className="ml-2 text-[var(--fresh-warn)]">en cuotas ({r.installments})</span>}
              {r.isDuplicate && <span className="ml-2 text-debt">posible duplicado</span>}
            </p>
          </div>
          <select value={r.kind} onChange={(e) => onChange(i, { kind: e.target.value as PreviewRow['kind'] })}
            className="bg-transparent border border-ink-line rounded-lg px-1.5 py-1 text-xs">
            <option value="gasto">gasto</option>
            <option value="ingreso">ingreso</option>
          </select>
          <select value={r.categoryId ?? ''} onChange={(e) => onChange(i, { categoryId: e.target.value || null })}
            className="bg-transparent border border-ink-line rounded-lg px-1.5 py-1 text-xs max-w-[7rem]">
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <MoneyText value={r.amount} className="text-sm text-zinc-200 w-20 text-right" />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- src/features/import/PreviewTable.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/import/PreviewTable.tsx src/features/import/PreviewTable.test.tsx
git commit -m "feat(import): tabla de vista previa editable"
```

---

### Task 8: Pantalla de import + ruta + entrada en Ajustes

**Files:**
- Create: `src/features/import/ImportScreen.tsx`
- Create: `src/features/import/ImportScreen.test.tsx`
- Modify: `src/app/router.tsx` (ruta `/importar` lazy)
- Modify: `src/features/ajustes/AjustesScreen.tsx` (link a `/importar`)

**Interfaces:**
- Consumes: `parseBiceVisaCsv`, `flagDuplicates`, `mapBankCategory`, `useImportPreview`, `useImportTransactions`, `useAccounts`, `useCategories`, `PreviewTable`/`PreviewRow`.
- Produces: `ImportScreen` (default de la ruta `/importar`).

- [ ] **Step 1: Escribir el test que falla**

Create `src/features/import/ImportScreen.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { ImportScreen } from './ImportScreen'
import { parseBiceVisaCsv } from '../../parsers/biceVisaCsv'
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useImportPreview } from '../../data/useImportPreview'
import { useImportTransactions } from '../../data/useImportTransactions'

vi.mock('../../parsers/biceVisaCsv')
vi.mock('../../data/useAccounts')
vi.mock('../../data/useCategories')
vi.mock('../../data/useImportPreview')
vi.mock('../../data/useImportTransactions')

const mutate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useAccounts).mockReturnValue({ data: [{ id: 'acc-bice', name: 'BICE Visa Gold', type: 'credit', bank: 'BICE' }] } as any)
  vi.mocked(useCategories).mockReturnValue({ data: [{ id: 'cat-transporte', name: 'Transporte' }] } as any)
  vi.mocked(useImportPreview).mockReturnValue({ data: [] } as any)
  vi.mocked(useImportTransactions).mockReturnValue({ mutate, isPending: false, isError: false } as any)
  vi.mocked(parseBiceVisaCsv).mockResolvedValue([
    { date: '2026-07-10', amount: 5500, description: 'Google Play', kind: 'gasto', bankCategory: 'Autos Y Transporte' },
  ])
})

function renderScreen() {
  return render(<MemoryRouter><ImportScreen /></MemoryRouter>)
}

describe('ImportScreen', () => {
  it('should_ShowPreview_When_FileParsed', async () => {
    renderScreen()

    const file = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await userEvent.upload(screen.getByLabelText(/archivo/i), file)

    expect(await screen.findByText('Google Play')).toBeInTheDocument()
  })

  it('should_ImportSelectedRows_When_Confirmed', async () => {
    const user = userEvent.setup()
    renderScreen()

    const file = new File(['x'], 'cartola.csv', { type: 'text/csv' })
    await user.upload(screen.getByLabelText(/archivo/i), file)
    await screen.findByText('Google Play')
    await user.click(screen.getByRole('button', { name: /importar/i }))

    await waitFor(() => expect(mutate).toHaveBeenCalled())
    const payload = mutate.mock.calls[0][0]
    expect(payload.accountId).toBe('acc-bice')
    expect(payload.billingCycleId).toBeNull()
    expect(payload.rows).toHaveLength(1)
    expect(payload.rows[0]).toMatchObject({ amount: 5500, categoryId: 'cat-transporte' })
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm run test -- src/features/import/ImportScreen.test.tsx`
Expected: FAIL — `ImportScreen` no existe.

- [ ] **Step 3: Implementar la pantalla**

Create `src/features/import/ImportScreen.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useImportPreview } from '../../data/useImportPreview'
import { useImportTransactions } from '../../data/useImportTransactions'
import { parseBiceVisaCsv } from '../../parsers/biceVisaCsv'
import { flagDuplicates } from './importDedup'
import { mapBankCategory } from './bankCategoryMap'
import { PreviewTable, type PreviewRow } from './PreviewTable'
import { MoneyText } from '../../components/ui/MoneyText'
import type { RawMovement } from '../../parsers/types'
import type { Category } from '../../data/types'

function resolveCategoryId(m: RawMovement, categories: Category[]): string | null {
  const name = mapBankCategory(m.bankCategory)
  if (!name) return null
  return categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null
}

export function ImportScreen() {
  const nav = useNavigate()
  const accounts = useAccounts()
  const categories = useCategories()
  const importTx = useImportTransactions()

  const [movements, setMovements] = useState<RawMovement[] | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [parseError, setParseError] = useState(false)

  const biceAccount = accounts.data?.find((a) => a.type === 'credit')

  const range = useMemo(() => {
    if (!movements || movements.length === 0) return null
    const dates = movements.map((m) => m.date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [movements])

  const preview = useImportPreview(biceAccount?.id, range)

  useEffect(() => {
    if (!movements) return
    const cats = categories.data ?? []
    const dupFlags = flagDuplicates(movements, preview.data ?? [])
    setRows(movements.map((m, i) => ({
      date: m.date, description: m.description, amount: m.amount, kind: m.kind,
      installments: m.installments, isDuplicate: dupFlags[i], selected: !dupFlags[i],
      categoryId: resolveCategoryId(m, cats),
    })))
  }, [movements, preview.data, categories.data])

  async function onFile(file: File) {
    setParseError(false)
    try {
      setMovements(await parseBiceVisaCsv(file))
    } catch {
      setParseError(true)
    }
  }

  function patchRow(index: number, patch: Partial<PreviewRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const selected = rows.filter((r) => r.selected)
  const slrdDrop = selected.filter((r) => r.kind === 'gasto').reduce((s, r) => s + r.amount, 0)

  function confirm() {
    if (!biceAccount || selected.length === 0) return
    importTx.mutate({
      accountId: biceAccount.id,
      billingCycleId: null,
      rows: selected.map((r) => ({
        date: r.date, amount: r.amount, description: r.description, kind: r.kind, categoryId: r.categoryId,
      })),
    }, { onSuccess: () => nav('/') })
  }

  return (
    <section className="px-6 pt-8 flex flex-col gap-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">importar · BICE Visa</p>

      <label className="text-sm text-zinc-300">
        Archivo de cartola (.csv)
        <input type="file" accept=".csv" aria-label="Archivo de cartola"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          className="mt-2 block w-full text-xs" />
      </label>

      {parseError && <p className="text-debt text-sm">No se pudo leer el archivo. Revisá que sea la cartola CSV de la Visa.</p>}

      {rows.length > 0 && (
        <>
          <div className="text-[11px] text-zinc-500">
            {selected.length} de {rows.length} seleccionados · bajará tu SLRD en{' '}
            <MoneyText value={slrdDrop} className="text-debt" />
          </div>
          <PreviewTable
            rows={rows} categories={categories.data ?? []}
            onChange={patchRow}
            onToggleAll={(sel) => setRows((rs) => rs.map((r) => ({ ...r, selected: sel })))}
            onBulkCategory={(categoryId) => setRows((rs) => rs.map((r) => (r.selected ? { ...r, categoryId } : r)))}
          />
          {importTx.isError && <p className="text-debt text-sm">No se pudo importar. Reintentá.</p>}
          <button onClick={confirm} disabled={selected.length === 0 || importTx.isPending}
            className="w-full mt-2 bg-accent text-accent-deep font-medium rounded-xl py-4 active:scale-[0.98] transition-transform disabled:opacity-40">
            {importTx.isPending ? 'Importando…' : `Importar ${selected.length} movimientos`}
          </button>
        </>
      )}
    </section>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm run test -- src/features/import/ImportScreen.test.tsx`
Expected: PASS.

- [ ] **Step 5: Agregar la ruta lazy**

Modify `src/app/router.tsx` — agregar el lazy y la ruta (junto a las demás):

```ts
const ImportScreen = lazy(() =>
  import('../features/import/ImportScreen').then((m) => ({ default: m.ImportScreen })))
```

Y en el array de rutas, después de `/ajustes`:

```ts
  { path: '/importar', element: screen(<ImportScreen />) },
```

- [ ] **Step 6: Agregar la entrada en Ajustes**

Modify `src/features/ajustes/AjustesScreen.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { SubscriptionsSection } from './SubscriptionsSection'
import { CategoriesSection } from './CategoriesSection'
import { BiceConfigSection } from './BiceConfigSection'
import { FreshnessSection } from './FreshnessSection'

export function AjustesScreen() {
  return (
    <section className="px-6 pt-8 flex flex-col gap-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ajustes</p>
      <Link to="/importar"
        className="bg-ink-2 border border-ink-line rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.99]">
        <span className="text-sm text-zinc-200">Importar movimientos (cartola BICE Visa)</span>
        <span className="text-accent-bright text-sm">Importar</span>
      </Link>
      <SubscriptionsSection />
      <CategoriesSection />
      <BiceConfigSection />
      <FreshnessSection />
    </section>
  )
}
```

- [ ] **Step 7: Verificar suite completa + build**

Run: `npm run test && npm run build`
Expected: todos los tests verdes (124 previos + nuevos); build OK con el chunk de `ImportScreen` separado.

- [ ] **Step 8: Commit**

```bash
git add src/features/import/ImportScreen.tsx src/features/import/ImportScreen.test.tsx src/app/router.tsx src/features/ajustes/AjustesScreen.tsx
git commit -m "feat(import): pantalla de import, ruta /importar y entrada en Ajustes"
```

---

## Verificación final de la Fase A

- [ ] `npm run test` — toda la suite verde.
- [ ] `npm run build` — OK; `ImportScreen` en su propio chunk lazy.
- [ ] `npm run lint` — sin errores nuevos (warnings cosméticos aceptables).
- [ ] Prueba manual end-to-end: Ajustes → Importar → subir el CSV real de la Visa → preview con duplicados marcados y categorías sugeridas → confirmar → dashboard muestra el SLRD bajado y el historial los movimientos nuevos.

## Notas de handoff a Fase B (Santander PDF)

- El pipeline (preview, dedup, insert) queda listo y agnóstico; Fase B solo agrega `parsers/santanderPdf.ts` (pdf.js + `parseSantanderLines` puro) y un selector de fuente en `ImportScreen`.
- Santander = cuenta `type='debit'` → `slrdDelta=0`, no toca el SLRD (solo analítica).
