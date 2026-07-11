# Import de cartola — Fase B (Santander PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Importar la cartola PDF de la cuenta débito Santander Vista (Cuentamática) como movimientos de analítica (no afectan el SLRD), reusando el pipeline de preview/insert de la Fase A.

**Architecture:** Se agrega un segundo adaptador de parseo al pipeline existente. El parser de Santander trabaja sobre **items posicionados (x/y)** extraídos con pdf.js — NO sobre texto aplanado — porque la columna del monto (x≈390 cargos vs x≈462 abonos) da el tipo de forma confiable. La extracción con pdf.js queda aislada en un módulo que solo se carga bajo demanda; el core de parseo es una función pura testeada con fixtures derivados de la salida real de pdf.js. `ImportScreen` gana un selector de fuente (BICE Visa / Santander) que elige parser, cuenta y mensaje de impacto.

**Tech Stack:** React 19, Vite, TypeScript, Tailwind, @tanstack/react-query, pdfjs-dist@^6.1 (nueva, ya instalada), Vitest + Testing Library, Supabase.

## Global Constraints

- Montos: enteros CLP, sin decimales; valor absoluto (`type` distingue signo).
- Todo acceso a datos vía hooks en `src/data/`; ningún componente llama a supabase directo.
- Tests con Vitest + Testing Library, patrón AAA, nombres `should_X_When_Y`.
- `pdfjs-dist` (parser + worker) debe quedar fuera del grafo estático de cualquier módulo que un test importe, y fuera del bundle principal — se carga vía **dynamic import** desde `ImportScreen` solo cuando la fuente es Santander.
- Santander Vista = cuenta `type='debit'` → `slrdDelta=0`, NO afecta el SLRD (solo analítica). `billing_cycle_id=null`.
- BICE Visa (Fase A) sigue igual: cuenta `type='credit'`, baja el SLRD.
- La suite existente (143 tests) debe quedar verde.

## Contexto de la extracción real (pdf.js, cuenta Cuentamática)

Cada movimiento es una línea (mismo `y`) de items con coordenada `x`:
- Fecha del día `DD/MM` en `x≈31`, **solo** en el primer movimiento de cada día (se arrastra a los siguientes).
- SUC `93` en `x≈132`; NUMERO en `x≈73` (compras) o `x≈160` (transferencias).
- Descripción en `x≈160–304`.
- Monto en `x≈390` → columna **CARGOS (gasto)**; en `x≈462` → columna **ABONOS (ingreso)**.
- Saldo diario en `x≈544`, en líneas con los tokens `Saldo` + `Dia` (se ignoran).
- Rango de la cartola: dos fechas `DD/MM/YYYY` (DESDE/HASTA) en el header → dan el año de las fechas `DD/MM`.

---

### Task 1: Parser de Santander (PDF por coordenadas)

**Files:**
- Create: `src/parsers/santanderPdf.ts` (puro, testeable)
- Create: `src/parsers/santanderPdf.test.ts`
- Create: `src/parsers/santanderPdfExtract.ts` (glue de pdf.js, browser-only, sin test)
- Modify: `package.json` (ya tiene `pdfjs-dist` en devDeps; confirmar)

**Interfaces:**
- Consumes: `RawMovement` (de `./types`).
- Produces:
  - `interface PdfItem { str: string; x: number }`
  - `interface PdfLine { y: number; items: PdfItem[] }` (items ordenados por x asc)
  - `parseSantanderMovements(lines: PdfLine[]): RawMovement[]` (puro)
  - `extractPdfLines(file: File): Promise<PdfLine[]>` (pdf.js)
  - `parseSantanderPdf(file: File): Promise<RawMovement[]>`

- [ ] **Step 1: Confirmar la dependencia**

Run: `npm ls pdfjs-dist`
Expected: muestra `pdfjs-dist@6.x` en devDependencies. Si no está: `npm install -D pdfjs-dist`.

- [ ] **Step 2: Escribir los tests que fallan**

Create `src/parsers/santanderPdf.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseSantanderMovements, type PdfLine } from './santanderPdf'

// Fixtures derivados de la salida real de pdf.js (cuenta Cuentamática).
// Rango de la cartola: DESDE 29/05/2026 HASTA 30/06/2026.
const rangeLines: PdfLine[] = [
  { y: 663, items: [{ str: '78', x: 375 }, { str: '29/05/2026', x: 409 }] },
  { y: 662, items: [{ str: '30/06/2026', x: 461 }] },
]

// Día 01/06: un abono (Transf de, x≈462) y una compra (cargo, x≈395)
const day1: PdfLine[] = [
  { y: 546, items: [
    { str: '01/06', x: 31 }, { str: '93', x: 132 }, { str: '0091538369', x: 160 },
    { str: 'Transf', x: 213 }, { str: 'de', x: 246 }, { str: 'LILIANA', x: 261 },
    { str: 'D', x: 299 }, { str: '250.000', x: 462 },
  ] },
  { y: 537, items: [
    { str: '6150757', x: 73 }, { str: '93', x: 132 }, { str: 'Compra', x: 160 },
    { str: 'Nacional', x: 194 }, { str: 'STA.', x: 237 }, { str: 'ISABEL', x: 261 },
    { str: 'AP', x: 294 }, { str: '1.750', x: 395 },
  ] },
  { y: 483, items: [
    { str: '---', x: 160 }, { str: 'Saldo', x: 179 }, { str: 'Dia', x: 208 },
    { str: '---', x: 227 }, { str: '261.990', x: 544 },
  ] },
]

// Día 02/06 (fecha nueva a la izquierda): una compra
const day2: PdfLine[] = [
  { y: 465, items: [
    { str: '02/06', x: 31 }, { str: '6153631', x: 73 }, { str: '93', x: 132 },
    { str: 'Compra', x: 160 }, { str: 'Nacional', x: 194 }, { str: 'CAFETERIA', x: 237 },
    { str: 'TAKE', x: 285 }, { str: '3.800', x: 395 },
  ] },
]

describe('parseSantanderMovements', () => {
  it('should_ClassifyByColumn_When_ChequeVsAbono', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1])

    // el abono (x≈462) es ingreso; la compra (x≈395) es gasto
    expect(rows).toEqual([
      { date: '2026-06-01', amount: 250000, description: 'Transf de LILIANA D', kind: 'ingreso' },
      { date: '2026-06-01', amount: 1750, description: 'Compra Nacional STA. ISABEL AP', kind: 'gasto' },
    ])
  })

  it('should_SkipSaldoDiaLines_When_Parsing', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1])
    expect(rows.every((r) => !r.description.includes('Saldo'))).toBe(true)
    expect(rows).toHaveLength(2) // la línea "--- Saldo Dia --- 261.990" no cuenta
  })

  it('should_CarryDayForward_When_NoDateOnLine', () => {
    // day1 fija 01/06; su segunda línea (compra) no trae fecha y debe heredar 01/06
    const rows = parseSantanderMovements([...rangeLines, ...day1])
    expect(rows[1].date).toBe('2026-06-01')
  })

  it('should_UseNewDate_When_LineHasDateAtLeft', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1, ...day2])
    expect(rows[rows.length - 1]).toEqual({
      date: '2026-06-02', amount: 3800,
      description: 'Compra Nacional CAFETERIA TAKE', kind: 'gasto',
    })
  })

  it('should_StripNumeroFromDescription_When_Transfer', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1])
    // el numero de transferencia (0091538369) no debe aparecer en la glosa
    expect(rows[0].description).toBe('Transf de LILIANA D')
  })
})
```

- [ ] **Step 3: Correr los tests para verificar que fallan**

Run: `npm run test -- src/parsers/santanderPdf.test.ts`
Expected: FAIL — `parseSantanderMovements` no existe.

- [ ] **Step 4: Implementar el parser puro**

Create `src/parsers/santanderPdf.ts`:

```ts
import type { RawMovement } from './types'

export interface PdfItem {
  str: string
  x: number
}

export interface PdfLine {
  y: number
  items: PdfItem[] // ordenados por x ascendente
}

const DATE_DDMM = /^\d{2}\/\d{2}$/
const DATE_FULL = /^\d{2}\/\d{2}\/\d{4}$/
const AMOUNT = /^\d{1,3}(?:\.\d{3})*$/

// Coordenadas x del layout real de la Cuentamática.
const DATE_X_MAX = 60
const DESC_X_MIN = 140
const DESC_X_MAX = 360
const AMOUNT_X_MIN = 370
const AMOUNT_X_MAX = 500
// Monto a la izquierda de este x = columna CARGOS (gasto); a la derecha = ABONOS (ingreso).
const CARGO_ABONO_SPLIT_X = 420

function amountToInt(s: string): number {
  return Number(s.replace(/\./g, '')) || 0
}

function toIso(ddmm: string, year: number): string {
  const [dd, mm] = ddmm.split('/')
  return `${year}-${mm}-${dd}`
}

interface DateRange {
  desde: string // ISO
  hasta: string // ISO
}

function findRange(lines: PdfLine[]): DateRange | null {
  const fulls: string[] = []
  for (const line of lines) {
    for (const it of line.items) {
      if (DATE_FULL.test(it.str)) {
        const [dd, mm, yy] = it.str.split('/')
        fulls.push(`${yy}-${mm}-${dd}`)
      }
    }
  }
  if (fulls.length === 0) return null
  const sorted = [...fulls].sort()
  return { desde: sorted[0], hasta: sorted[sorted.length - 1] }
}

function resolveYear(ddmm: string, range: DateRange | null): number {
  if (!range) return new Date().getUTCFullYear()
  const [dd, mm] = ddmm.split('/')
  const desdeY = Number(range.desde.slice(0, 4))
  const hastaY = Number(range.hasta.slice(0, 4))
  if (desdeY === hastaY) return desdeY
  // rango que cruza el año: elegí el año que deja la fecha dentro de [desde, hasta]
  for (const y of [desdeY, hastaY]) {
    const iso = `${y}-${mm}-${dd}`
    if (iso >= range.desde && iso <= range.hasta) return y
  }
  return hastaY
}

function buildDescription(items: PdfItem[]): string {
  return items
    .filter((it) => it.x > DESC_X_MIN && it.x < DESC_X_MAX)
    .filter((it) => it.str !== '93' && !/^\d+$/.test(it.str)) // saca SUC y el numero
    .map((it) => it.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSantanderMovements(lines: PdfLine[]): RawMovement[] {
  const range = findRange(lines)
  const out: RawMovement[] = []
  let currentDay: string | null = null

  for (const line of lines) {
    const dateItem = line.items.find((it) => it.x < DATE_X_MAX && DATE_DDMM.test(it.str))
    if (dateItem) currentDay = dateItem.str

    // línea de cierre de día ("--- Saldo Dia --- <saldo>"): ignorar
    const isSaldoDia =
      line.items.some((it) => it.str === 'Saldo') && line.items.some((it) => it.str === 'Dia')
    if (isSaldoDia) continue

    const amountItem = line.items.find(
      (it) => it.x >= AMOUNT_X_MIN && it.x <= AMOUNT_X_MAX && AMOUNT.test(it.str),
    )
    const hasSuc = line.items.some((it) => it.str === '93')
    if (!amountItem || !hasSuc || !currentDay) continue

    out.push({
      date: toIso(currentDay, resolveYear(currentDay, range)),
      amount: amountToInt(amountItem.str),
      description: buildDescription(line.items),
      kind: amountItem.x < CARGO_ABONO_SPLIT_X ? 'gasto' : 'ingreso',
    })
  }
  return out
}
```

- [ ] **Step 5: Correr los tests para verificar que pasan**

Run: `npm run test -- src/parsers/santanderPdf.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Implementar el glue de pdf.js (browser-only, sin test)**

Create `src/parsers/santanderPdfExtract.ts`:

```ts
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseSantanderMovements, type PdfLine } from './santanderPdf'
import type { RawMovement } from './types'

GlobalWorkerOptions.workerSrc = workerUrl

// Extrae cada página como líneas de items posicionados (agrupados por y, ordenados por x).
export async function extractPdfLines(file: File): Promise<PdfLine[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const lines: PdfLine[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const byY = new Map<number, { str: string; x: number }[]>()

    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const y = Math.round(item.transform[5])
      const x = Math.round(item.transform[4])
      const row = byY.get(y) ?? []
      row.push({ str: item.str, x })
      byY.set(y, row)
    }

    const ys = [...byY.keys()].sort((a, b) => b - a) // de arriba hacia abajo
    for (const y of ys) {
      lines.push({ y, items: byY.get(y)!.sort((a, b) => a.x - b.x) })
    }
  }
  return lines
}

export async function parseSantanderPdf(file: File): Promise<RawMovement[]> {
  return parseSantanderMovements(await extractPdfLines(file))
}
```

Nota: este archivo NO se importa estáticamente desde ningún módulo que un test cargue. `ImportScreen` lo trae vía `import()` dinámico (Task 2), así que ni el worker `?url` ni `pdfjs-dist` entran al grafo de vitest ni al bundle principal.

- [ ] **Step 7: Verificar suite + build**

Run: `npm run test && npm run build`
Expected: toda la suite verde (143 previos + 5 nuevos); build OK.

- [ ] **Step 8: Commit**

```bash
git add src/parsers/santanderPdf.ts src/parsers/santanderPdf.test.ts src/parsers/santanderPdfExtract.ts package.json package-lock.json
git commit -m "feat(import): parser de cartola Santander (PDF por coordenadas) a RawMovement"
```

---

### Task 2: Selector de fuente en ImportScreen

**Files:**
- Modify: `src/features/import/ImportScreen.tsx`
- Modify: `src/features/import/ImportScreen.test.tsx`
- Modify: `src/features/ajustes/AjustesScreen.tsx` (etiqueta genérica del link)

**Interfaces:**
- Consumes: `parseBiceVisaCsv` (estático), `parseSantanderPdf` (dinámico desde `../../parsers/santanderPdfExtract`), `useAccounts`, `useCategories`, `useImportPreview`, `useImportTransactions`, `flagDuplicates`, `mapBankCategory`, `PreviewTable`.
- Produces: `ImportScreen` con selector de fuente `bice_visa | santander_vista`.

- [ ] **Step 1: Escribir los tests que fallan (agregar a los existentes)**

En `src/features/import/ImportScreen.test.tsx`, agregar el mock del extractor dinámico (junto a los `vi.mock` existentes) y dos tests nuevos. El mock:

```tsx
vi.mock('../../parsers/santanderPdfExtract', () => ({
  parseSantanderPdf: vi.fn().mockResolvedValue([
    { date: '2026-06-01', amount: 1750, description: 'Compra Nacional STA. ISABEL AP', kind: 'gasto' },
  ]),
}))
```

Y en `beforeEach`, ampliar el mock de `useAccounts` para incluir la cuenta débito:

```tsx
vi.mocked(useAccounts).mockReturnValue({ data: [
  { id: 'acc-bice', name: 'BICE Visa Gold', type: 'credit', bank: 'BICE' },
  { id: 'acc-santander', name: 'Santander Vista', type: 'debit', bank: 'Santander' },
] } as any)
```

Tests nuevos:

```tsx
it('should_ImportToDebitAccount_When_SantanderSourceSelected', async () => {
  const user = userEvent.setup()
  renderScreen()

  await user.click(screen.getByRole('button', { name: /santander/i }))
  const file = new File(['x'], 'cartola.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText(/archivo/i), file)
  await screen.findByText('Compra Nacional STA. ISABEL AP')
  await user.click(screen.getByRole('button', { name: /importar/i }))

  await waitFor(() => expect(mutate).toHaveBeenCalled())
  const payload = mutate.mock.calls[0][0]
  expect(payload.accountId).toBe('acc-santander')
  expect(payload.billingCycleId).toBeNull()
})

it('should_ShowNoSlrdImpact_When_SantanderSourceSelected', async () => {
  const user = userEvent.setup()
  renderScreen()

  await user.click(screen.getByRole('button', { name: /santander/i }))
  const file = new File(['x'], 'cartola.pdf', { type: 'application/pdf' })
  await user.upload(screen.getByLabelText(/archivo/i), file)
  await screen.findByText('Compra Nacional STA. ISABEL AP')

  expect(screen.getByText(/no afecta tu slrd/i)).toBeInTheDocument()
})
```

Los tests existentes de la Fase A deben seguir pasando (la fuente por defecto es `bice_visa`).

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npm run test -- src/features/import/ImportScreen.test.tsx`
Expected: FAIL — no existe el selector de fuente ni el mensaje "no afecta tu SLRD".

- [ ] **Step 3: Implementar el selector en ImportScreen**

Modify `src/features/import/ImportScreen.tsx`. Cambios:

1. Agregar el tipo y estado de fuente, y el helper de parseo por fuente. Al principio del componente (junto a los otros `useState`):

```tsx
type Source = 'bice_visa' | 'santander_vista'
```

```tsx
  const [source, setSource] = useState<Source>('bice_visa')
```

2. Reemplazar la resolución de cuenta fija por una que depende de la fuente:

```tsx
  const account = accounts.data?.find((a) =>
    source === 'bice_visa' ? a.type === 'credit' : a.type === 'debit',
  )
```

Y usar `account` en todos lados donde antes decía `biceAccount` (el `useMemo`/dedup range, `useImportPreview(account?.id, range)`, el guard de `confirm`, el payload `accountId: account.id`).

3. Reemplazar `onFile` para elegir el parser por fuente (dynamic import del de Santander):

```tsx
  async function onFile(file: File) {
    setParseError(false)
    setParseEmpty(false)
    setMovements(null)
    setRows([])
    try {
      const parsed = source === 'bice_visa'
        ? await parseBiceVisaCsv(file)
        : await (await import('../../parsers/santanderPdfExtract')).parseSantanderPdf(file)
      if (parsed.length === 0) {
        setParseEmpty(true)
        return
      }
      setMovements(parsed)
    } catch {
      setParseError(true)
    }
  }
```

4. Al cambiar de fuente, limpiar el estado del archivo previo. Agregar un handler:

```tsx
  function selectSource(next: Source) {
    setSource(next)
    setMovements(null)
    setRows([])
    setParseError(false)
    setParseEmpty(false)
  }
```

5. En el JSX, agregar el selector arriba del input de archivo, y cambiar el `accept` y el mensaje de impacto según la fuente. Reemplazar el encabezado + input existentes por:

```tsx
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">importar movimientos</p>

      <div className="flex gap-2">
        <button onClick={() => selectSource('bice_visa')}
          className={`rounded-lg px-3 py-1.5 text-sm ${source === 'bice_visa'
            ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'}`}>
          BICE Visa
        </button>
        <button onClick={() => selectSource('santander_vista')}
          className={`rounded-lg px-3 py-1.5 text-sm ${source === 'santander_vista'
            ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'}`}>
          Santander
        </button>
      </div>

      <label className="text-sm text-zinc-300">
        {source === 'bice_visa' ? 'Archivo de cartola (.csv)' : 'Archivo de cartola (.pdf)'}
        <input type="file" accept={source === 'bice_visa' ? '.csv' : '.pdf'} aria-label="Archivo de cartola"
          onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = '' }}
          className="mt-2 block w-full text-xs" />
      </label>
```

6. Cambiar el bloque de impacto (el que decía "bajará tu SLRD en $X") por uno condicional a la fuente:

```tsx
          <div className="text-[11px] text-zinc-500">
            {selected.length} de {rows.length} seleccionados ·{' '}
            {source === 'bice_visa'
              ? <>bajará tu SLRD en <MoneyText value={slrdDrop} className="text-debt" /></>
              : <span>solo analítica, no afecta tu SLRD</span>}
          </div>
```

(El resto —`PreviewTable`, botón confirmar, estados de error— queda igual, usando `account` en vez de `biceAccount`.)

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm run test -- src/features/import/ImportScreen.test.tsx`
Expected: PASS (los existentes + los 2 nuevos).

- [ ] **Step 5: Actualizar la etiqueta del link en Ajustes**

Modify `src/features/ajustes/AjustesScreen.tsx` — el texto del `<Link to="/importar">` de "Importar movimientos (cartola BICE Visa)" a genérico:

```tsx
        <span className="text-sm text-zinc-200">Importar movimientos (BICE Visa o Santander)</span>
```

- [ ] **Step 6: Verificar suite + build**

Run: `npm run test && npm run build`
Expected: toda la suite verde; build OK; el chunk de import ahora incluye el parser CSV, y `pdfjs-dist` aparece en un sub-chunk aparte cargado on-demand (no en el bundle principal).

- [ ] **Step 7: Commit**

```bash
git add src/features/import/ImportScreen.tsx src/features/import/ImportScreen.test.tsx src/features/ajustes/AjustesScreen.tsx
git commit -m "feat(import): selector de fuente BICE/Santander en la pantalla de import"
```

---

## Verificación final de la Fase B

- [ ] `npm run test` — toda la suite verde.
- [ ] `npm run build` — OK; `pdfjs-dist` en un sub-chunk on-demand, fuera del bundle principal.
- [ ] `npm run lint` — sin errores nuevos.
- [ ] Prueba manual end-to-end (usuaria): Ajustes → Importar → elegir Santander → subir el PDF real → preview con cargos (gasto) y abonos (ingreso) bien clasificados por columna, fechas correctas, "no afecta tu SLRD" → confirmar → los movimientos aparecen en Historial (analítica de categorías); el SLRD NO cambia.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Otra variante de layout Santander mueve las columnas x | Umbrales x centralizados como constantes; preview editable corrige clasificación errónea |
| pdf.js worker no carga en Vite | `?url` import estándar de Vite en el módulo browser-only; verificar en la prueba manual |
| PDF escaneado sin capa de texto | Fuera de alcance (se asume PDF generado por el banco); preview mostraría vacío → mensaje "no reconocido" (Fase A) |
| Transferencia con glosa que arranca en dígitos | `buildDescription` ya descarta tokens puramente numéricos (numero) |
