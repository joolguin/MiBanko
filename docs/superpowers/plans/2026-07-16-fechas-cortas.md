# Fechas cortas (Movimientos + Ciclo) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar las fechas ISO crudas de Movimientos y del Ciclo por el formato corto "14 jul" usando el helper `formatShortDate` que ya existe.

**Architecture:** Cambio puntual de render en dos componentes. Se reutiliza `formatShortDate` de `src/lib/format.ts` (mismo helper que usa el eje del gráfico SLRD). Sin código de formateo nuevo.

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react.

## Global Constraints

- Mobile-first Pixel 9 (375×812), dark, español. Test runner: `npm test` (`vitest run`); typecheck real: `npm run build`.
- Naming de tests: `should_<Resultado>_When_<Condición>`.
- `formatShortDate(dateKey: string): string` ya existe en `src/lib/format.ts` y devuelve `"14 jul"` (día mes, sin año) a partir de un ISO `YYYY-MM-DD`. NO se modifica.
- Sin cambios de datos ni de otros componentes.

---

### Task 1: Fecha corta en Movimientos

**Files:**
- Modify: `src/features/historial/TransactionsTab.tsx`
- Test: `src/features/historial/TransactionsTab.test.tsx`

**Interfaces:**
- Consumes: `formatShortDate` de `../../lib/format`.
- Produces: nada.

- [ ] **Step 1: Write the failing test**

Agregar este test dentro del `describe('TransactionsTab', ...)` en `TransactionsTab.test.tsx` (usa el factory `tx` existente, que por defecto tiene `transactionDate: '2026-07-12'`):

```tsx
  it('should_ShowShortDate_When_RenderingRow', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ transactionDate: '2026-07-12', accountName: 'BICE' })],
    } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText('12 jul · BICE')).toBeInTheDocument()
    expect(screen.queryByText(/2026-07-12/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/historial/TransactionsTab.test.tsx -t ShowShortDate`
Expected: FAIL — hoy la fila renderiza `2026-07-12 · BICE`, así que `getByText('12 jul · BICE')` no encuentra el nodo (y `queryByText(/2026-07-12/)` sí lo encuentra).

- [ ] **Step 3: Add the import**

En `TransactionsTab.tsx`, junto a los imports existentes:

```tsx
import { formatShortDate } from '../../lib/format'
```

- [ ] **Step 4: Apply the change**

En `TransactionsTab.tsx` (la línea del subtítulo de cada fila, actualmente):

```tsx
                    <span className="text-[11px] text-muted">{t.transactionDate} · {t.accountName}</span>
```

reemplazar por:

```tsx
                    <span className="text-[11px] text-muted">{formatShortDate(t.transactionDate)} · {t.accountName}</span>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/historial/TransactionsTab.test.tsx`
Expected: PASS (el test nuevo + los existentes sin regresión).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/features/historial/TransactionsTab.tsx src/features/historial/TransactionsTab.test.tsx
git commit -m "fix(historial): fecha corta en Movimientos (formatShortDate)"
```

---

### Task 2: Fecha corta en las cuotas del Ciclo

**Files:**
- Modify: `src/features/ciclo/UnpaidCyclesSection.tsx`
- Test: `src/features/ciclo/UnpaidCyclesSection.test.tsx`

**Interfaces:**
- Consumes: `formatShortDate` de `../../lib/format`.
- Produces: nada.

**Nota:** hay dos sitios en el componente — `vence {c.dueDate}` (cuota por vencer, línea ~29) y `vencía {c.dueDate}` (cuota vencida, línea ~41). Ambos reciben el mismo tratamiento. El test cubre el camino "por vencer" (el `beforeEach` mockea `usePaidCycles` como `[]`, así que el camino "vencía" no se renderiza en el test); el camino "vencía" es la misma transformación de una línea.

- [ ] **Step 1: Write the failing test**

Agregar este test dentro del `describe('UnpaidCyclesSection', ...)` en `UnpaidCyclesSection.test.tsx` (el `beforeEach` ya mockea una cuota con `dueDate: '2026-07-15'`; se necesita el `QueryClientProvider` como en el test existente):

```tsx
  it('should_ShowShortDueDate_When_Present', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UnpaidCyclesSection />
      </QueryClientProvider>,
    )
    expect(screen.getByText('vence 15 jul')).toBeInTheDocument()
    expect(screen.queryByText(/2026-07-15/)).not.toBeInTheDocument()
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/features/ciclo/UnpaidCyclesSection.test.tsx -t ShowShortDueDate`
Expected: FAIL — hoy renderiza `vence 2026-07-15`, así que `getByText('vence 15 jul')` no encuentra el nodo.

- [ ] **Step 3: Add the import**

En `UnpaidCyclesSection.tsx`, junto a los imports existentes:

```tsx
import { formatShortDate } from '../../lib/format'
```

- [ ] **Step 4: Apply both changes**

Cambio A — la cuota por vencer (actualmente):

```tsx
            <span className="text-[11px] text-muted">vence {c.dueDate}</span>
```

reemplazar por:

```tsx
            <span className="text-[11px] text-muted">vence {formatShortDate(c.dueDate)}</span>
```

Cambio B — la cuota vencida (actualmente):

```tsx
              <span className="text-[11px] text-faint">vencía {c.dueDate}</span>
```

reemplazar por:

```tsx
              <span className="text-[11px] text-faint">vencía {formatShortDate(c.dueDate)}</span>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- src/features/ciclo/UnpaidCyclesSection.test.tsx`
Expected: PASS (el test nuevo + el existente sin regresión).

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/features/ciclo/UnpaidCyclesSection.tsx src/features/ciclo/UnpaidCyclesSection.test.tsx
git commit -m "fix(ciclo): fecha corta en vencimientos de cuotas (formatShortDate)"
```

---

### Task 3: Verificación end-to-end

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Movimientos**

Levantar el dev server (`mibanko-dev`, 5173) en 375×812 dark, ir a Historial → Movimientos. Screenshot: cada fila muestra `14 jul · <cuenta>` (formato corto), sin ISO crudo.

- [ ] **Step 2: Ciclo**

Ir a Ciclo (o donde se listan las cuotas impagas). Screenshot: la cuota muestra `vence 15 jul` (o `vencía 15 jul` si está vencida), sin ISO crudo.

- [ ] **Step 3: Suite completa + build**

Run: `npm test` y `npm run build`
Expected: toda la suite verde, build exit 0.

- [ ] **Step 4: No hay commit** (tarea de verificación).

---

## Self-Review

**Spec coverage:**
- Sitio 1 (Movimientos, TransactionsTab.tsx:105) → Task 1. ✔
- Sitio 2 (Ciclo por vencer, UnpaidCyclesSection.tsx:29) → Task 2 cambio A. ✔
- Sitio 3 (Ciclo vencida, UnpaidCyclesSection.tsx:41) → Task 2 cambio B. ✔
- Verificación del spec → Task 3. ✔

**Placeholder scan:** sin TBD/TODO; todo el código completo en cada step. ✔

**Type consistency:** `formatShortDate(dateKey: string): string` se importa y usa con la misma firma en ambas tasks; recibe los strings ISO `t.transactionDate` / `c.dueDate` que ya son `string`. ✔
