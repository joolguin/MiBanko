# SLRD Chart Scale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la línea del SLRD deje de medir 0,7 px de recorrido y use el alto del gráfico, dándole al eje un dominio propio y redondeado en vez de uno compartido con un saldo contable 24× más grande.

**Architecture:** `buildChart` deja de calcular el dominio sobre las dos series y lo calcula solo sobre `slrdInmediato`, pasándolo por una función nueva `niceDomain` que redondea a topes y pasos leíbles. El componente pierde la serie del contable y su leyenda, y gana gridlines, relleno de área, punto final y márgenes para que nada toque el borde.

**Tech Stack:** React 19, Tailwind 3.4, SVG a mano (sin librería de charts), Vitest + Testing Library (jsdom), oxlint.

Spec: `docs/superpowers/specs/2026-07-15-slrd-chart-scale-design.md`

## Global Constraints

- Datos reales de referencia: 6 puntos, SLRD entre $103.780 y $115.000, saldo contable plano en $2.500.000.
- Colores solo con tokens (`accent`, `accent-bright`, `ink-line`, `ink-1`, `zinc-*`). Nada de hex.
- Montos con `formatCLP` / `MoneyText`. Todo en español.
- **Nunca construir un `Date` a partir de una clave `AAAA-MM-DD`**: da medianoche UTC y corre la fecha un día (DB y navegador en UTC, usuaria en Santiago).
- Gridlines sólidas, nunca punteadas (el punteado lee como umbral).
- Hit target de los puntos ≥24 px de diámetro.
- Conventional Commits en español. No pushear.

---

### Task 1: formatShortDate

**Files:**
- Modify: `src/lib/format.ts`
- Test: `src/lib/format.test.ts` (ya existe; se le agrega un `describe`)

**Interfaces:**
- Consumes: nada.
- Produces: `formatShortDate(dateKey: string): string`. La usa la Task 4.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar al final de `src/lib/format.test.ts`, y sumar `formatShortDate` al import de la línea 2:

```ts
describe('formatShortDate', () => {
  it('should_FormatDayAndShortMonth', () => {
    expect(formatShortDate('2026-07-09')).toBe('9 jul')
  })

  it('should_StripLeadingZero_When_DayIsSingleDigit', () => {
    expect(formatShortDate('2026-01-05')).toBe('5 ene')
  })

  it('should_FormatLastMonth_When_December', () => {
    expect(formatShortDate('2026-12-31')).toBe('31 dic')
  })

  // Con `new Date('2026-03-01')` (medianoche UTC) + toLocaleDateString en
  // Santiago (UTC−3/−4) esto daría "28 feb": la fecha se corre un día.
  it('should_NotShiftDay_When_FirstOfMonth', () => {
    expect(formatShortDate('2026-03-01')).toBe('1 mar')
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/lib/format.test.ts`
Expected: FAIL — `formatShortDate is not a function` (o error de import en TS).

- [ ] **Step 3: Implementar**

Agregar al final de `src/lib/format.ts`:

```ts
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Sin `new Date()` a propósito: parsear 'AAAA-MM-DD' da medianoche UTC y, con la
// DB y el navegador en UTC pero la usuaria en Santiago, eso corre la fecha un día
// (ver santiagoDate.ts). String-splitting puro: sin zona horaria no hay corrimiento.
export function formatShortDate(dateKey: string): string {
  const [, month, day] = dateKey.split('-')
  return `${Number(day)} ${MESES[Number(month) - 1]}`
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/lib/format.test.ts`
Expected: PASS, 11 tests (7 existentes + 4 nuevos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/lib/format.test.ts
git commit -m "feat(format): helper de fecha corta sin corrimiento de zona"
```

---

### Task 2: niceDomain

**Files:**
- Modify: `src/data/chartScale.ts`
- Test: `src/data/chartScale.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `niceDomain(min: number, max: number, tickCount?: number): { min: number; max: number; step: number; ticks: number[] }`. La usa la Task 3.

- [ ] **Step 1: Escribir los tests que fallan**

Agregar `niceDomain` al import de la línea 2 de `src/data/chartScale.test.ts`, y este `describe` entre `filterByRange` y `buildChart`:

```ts
describe('niceDomain', () => {
  it('should_RoundToNiceBounds_When_GivenTheRealRange', () => {
    // Datos reales: el SLRD fue de 115.000 a 103.780 entre el 9 y el 14 de julio.
    expect(niceDomain(103780, 115000)).toEqual({
      min: 100000, max: 120000, step: 10000, ticks: [100000, 110000, 120000],
    })
  })

  it('should_ContainTheData_When_Rounded', () => {
    const d = niceDomain(103780, 115000)

    expect(d.min).toBeLessThanOrEqual(103780)
    expect(d.max).toBeGreaterThanOrEqual(115000)
  })

  // El rango 0 hace Math.log10(0) === -Infinity y rompe todo el cálculo. No es
  // teórico: el saldo contable es plano hoy y el SLRD puede serlo cualquier semana.
  it('should_ExpandRange_When_SeriesIsFlat', () => {
    const d = niceDomain(103780, 103780)

    expect(Number.isFinite(d.step)).toBe(true)
    expect(d.max).toBeGreaterThan(d.min)
    expect(d.min).toBeLessThanOrEqual(103780)
    expect(d.max).toBeGreaterThanOrEqual(103780)
  })

  it('should_SurviveAllZeroes_When_SeriesIsFlatAtZero', () => {
    const d = niceDomain(0, 0)

    expect(Number.isFinite(d.step)).toBe(true)
    expect(d.max).toBeGreaterThan(d.min)
  })

  it('should_ShrinkStep_When_RangeIsSmall', () => {
    const d = niceDomain(1000, 1050)

    expect(d.step).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `npx vitest run src/data/chartScale.test.ts`
Expected: FAIL — `niceDomain is not a function`.

- [ ] **Step 3: Implementar**

Agregar en `src/data/chartScale.ts`, antes de `buildChart`:

```ts
export interface NiceDomain { min: number; max: number; step: number; ticks: number[] }

// Redondea el dominio a topes y pasos leíbles (100.000 / 110.000 / 120.000) en vez
// de usar los extremos crudos, que dejan la línea apoyada sobre el borde del plot.
export function niceDomain(min: number, max: number, tickCount = 3): NiceDomain {
  let lo = min
  let hi = max
  // Serie plana: el rango es 0 y Math.log10(0) da -Infinity. Se expande alrededor
  // del valor antes de redondear.
  if (hi === lo) {
    const pad = Math.abs(lo) * 0.1 || 1
    lo -= pad / 2
    hi += pad / 2
  }
  const rawStep = (hi - lo) / Math.max(tickCount - 1, 1)
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)))
  const normalized = rawStep / magnitude
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude

  // Redondeo a la precisión del paso: con paso 10.000 los ticks son enteros, y con
  // pasos sub-unitarios (solo el caso degenerado de todo en cero) no se pierden.
  const decimals = Math.max(0, -Math.floor(Math.log10(step)))
  const round = (v: number) => Number(v.toFixed(decimals))

  const niceMin = round(Math.floor(lo / step) * step)
  const niceMax = round(Math.ceil(hi / step) * step)
  const count = Math.round((niceMax - niceMin) / step)
  const ticks = Array.from({ length: count + 1 }, (_, i) => round(niceMin + i * step))

  return { min: niceMin, max: niceMax, step, ticks }
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `npx vitest run src/data/chartScale.test.ts`
Expected: PASS en los 5 tests nuevos de `niceDomain`. Los de `buildChart` siguen pasando: todavía no se tocó.

- [ ] **Step 5: Commit**

```bash
git add src/data/chartScale.ts src/data/chartScale.test.ts
git commit -m "feat(historial): niceDomain para ejes con topes redondos"
```

---

### Task 3: buildChart con dominio propio del SLRD, y el componente

**Una sola task a propósito.** El cambio de forma de `buildChart` (deja de devolver
`series`) rompe a `SlrdLineChart` en el mismo movimiento: son una sola unidad
atómica. Separarlas dejaría en la historia un commit con la suite en rojo, y un
revisor no puede aprobar una sin la otra.

**Files:**
- Modify: `src/data/chartScale.ts:37-67` (`Series`, `SERIES_KEYS`, `buildChart`)
- Modify: `src/features/historial/SlrdLineChart.tsx` (entero)
- Test: `src/data/chartScale.test.ts:41-85` (el `describe('buildChart')`)
- Test: `src/features/historial/SlrdLineChart.test.tsx`

**Interfaces:**
- Consumes: `niceDomain` de la Task 2 y `formatShortDate` de la Task 1.
- Produces: `buildChart(points, geo)` devuelve `{ yMin, yMax, ticks, path, areaPath, x, y }`. Ya no devuelve `series`.

**Tres de los cinco tests de `buildChart` se reemplazan, no se agregan.** El más importante es `should_ComputeDomainFromBothSeries_When_Built`, que afirma `yMax === 150` (el máximo del contable): **codifica el bug como comportamiento deseado**. Reemplazarlo es el objetivo de la task, no un daño colateral.

- [ ] **Step 1: Reemplazar los tests de chartScale**

En `src/data/chartScale.test.ts`, dentro del `describe('buildChart')`:

(a) Reemplazar `should_ComputeDomainFromBothSeries_When_Built` por:

```ts
  // Los puntos tienen SLRD 0 y 50, contable 100 y 150. El dominio sale solo del
  // SLRD: antes el contable fijaba yMax en 150 y aplastaba la línea contra el piso.
  it('should_ComputeDomainFromSlrdOnly_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.yMin).toBe(0)
    expect(chart.yMax).toBe(50)
  })
```

(b) Reemplazar `should_MapMaxValue_ToTopAndMinToBottom` por esta versión, que se afirma contra el dominio en vez de contra valores crudos (el dominio ahora está redondeado):

```ts
  it('should_MapDomainMax_ToTop_And_DomainMin_ToBottom', () => {
    const chart = buildChart(points, geo)

    expect(chart.y(chart.yMax)).toBe(0)
    expect(chart.y(chart.yMin)).toBe(100)
  })
```

(c) Reemplazar `should_BuildTwoSeriesPaths_When_Built` por:

```ts
  it('should_BuildOneLinePathAndOneClosedAreaPath_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.path.startsWith('M')).toBe(true)
    expect(chart.areaPath.endsWith('Z')).toBe(true)
  })

  it('should_ExposeTicksForGridlines_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.ticks[0]).toBe(chart.yMin)
    expect(chart.ticks[chart.ticks.length - 1]).toBe(chart.yMax)
  })
```

(d) `should_MapFirstAndLastX_ToEdges` y `should_SpaceXByRealDate_When_DaysAreMissing` **no se tocan**: el eje X no cambia.

- [ ] **Step 2: Actualizar los tests del componente**

En `src/features/historial/SlrdLineChart.test.tsx`:

(a) Agregar `within` al import de `@testing-library/react`.

(b) Reemplazar `should_RenderTwoSeriesPaths_When_GivenPoints` por:

```ts
  it('should_RenderOnlyTheSlrdSeries_When_GivenPoints', () => {
    const { container } = render(<SlrdLineChart points={points} />)

    expect(container.querySelectorAll('path[data-series]')).toHaveLength(1)
    expect(container.querySelector('path[data-series="saldoContable"]')).toBeNull()
  })
```

(c) Reemplazar `should_ShowMinMaxAxesAndFirstLastDates_When_GivenTwoOrMorePoints` por:

```ts
  // Los puntos tienen SLRD 100 y 150 → dominio redondeado 100..150. El $250 del
  // contable ya no está: dejó de definir el eje.
  it('should_ShowSlrdDomainTicksAndShortDates_When_GivenTwoOrMorePoints', () => {
    render(<SlrdLineChart points={points} />)

    expect(screen.getByTestId('chart-first-date')).toHaveTextContent('8 jul')
    expect(screen.getByTestId('chart-last-date')).toHaveTextContent('9 jul')
    expect(screen.queryByText('$250')).toBeNull()
  })
```

(d) En `should_ShowTooltipWithBreakdown_When_PointHovered` y `should_ToggleTooltip_When_PointTapped`, acotar las aserciones de monto al tooltip. Hoy dicen `screen.getByText('$150')`, y con el tick del eje y la etiqueta directa ese texto pasa a estar tres veces en pantalla, así que `getByText` falla por ambigüedad. El comportamiento probado es el mismo; la aserción pasa a ser más precisa:

```ts
  it('should_ShowTooltipWithBreakdown_When_PointHovered', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.hover(screen.getByTestId('point-2026-07-09'))

    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')
    expect(within(screen.getByTestId('tooltip')).getByText('$150')).toBeInTheDocument()
  })

  it('should_ToggleTooltip_When_PointTapped', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.click(screen.getByTestId('point-2026-07-09'))
    expect(within(screen.getByTestId('tooltip')).getByText('$150')).toBeInTheDocument()

    await user.click(screen.getByTestId('point-2026-07-09'))
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
  })
```

(e) `should_ToggleWithOneClick_When_MouseLeavesPinnedPointBeforeRetapping` **no se toca**: no afirma montos.

- [ ] **Step 3: Correr y verificar que fallan los dos archivos**

Run: `npx vitest run src/data/chartScale.test.ts src/features/historial/SlrdLineChart.test.tsx`
Expected: FAIL en ambos — `should_ComputeDomainFromSlrdOnly_When_Built` da `yMax` 150 en vez de 50; `chart.path` / `chart.areaPath` / `chart.ticks` son `undefined`; y el componente no encuentra `tooltip` ni las fechas cortas.

- [ ] **Step 4: Implementar chartScale**

En `src/data/chartScale.ts`, borrar la interfaz `Series` y la constante `SERIES_KEYS` (líneas 37-42), y reemplazar `buildChart` por:

```ts
export function buildChart(points: SlrdHistoryPoint[], geo: ChartGeometry) {
  // Solo el SLRD: incluir el saldo contable (24× más grande) fijaba el techo del
  // eje y dejaba la línea del SLRD con 0,7px de recorrido en 160px de alto.
  const values = points.map((p) => p.slrdInmediato)
  const domain = niceDomain(Math.min(...values), Math.max(...values))
  const span = domain.max - domain.min || 1

  // Eje X proporcional a la fecha real (no al índice): los días faltantes dejan
  // un hueco proporcional en vez de equiespaciar los puntos. points viene ordenado
  // ascendente por fecha, así que el primero y el último son los extremos temporales.
  const firstDay = dayNumber(points[0].snapshotDate)
  const daySpan = dayNumber(points[points.length - 1].snapshotDate) - firstDay || 1

  const x = (i: number) => ((dayNumber(points[i].snapshotDate) - firstDay) / daySpan) * geo.width
  const y = (value: number) => geo.height - ((value - domain.min) / span) * geo.height

  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.slrdInmediato)}`)
    .join(' ')
  const areaPath = `${path} L ${x(points.length - 1)} ${geo.height} L ${x(0)} ${geo.height} Z`

  return { yMin: domain.min, yMax: domain.max, ticks: domain.ticks, path, areaPath, x, y }
}
```

- [ ] **Step 5: Reescribir el componente**

Reemplazar el contenido entero de `src/features/historial/SlrdLineChart.tsx` por:

```tsx
import { useState } from 'react'
import { buildChart } from '../../data/chartScale'
import type { SlrdHistoryPoint } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'
import { formatCLP, formatShortDate } from '../../lib/format'

// El plot vive adentro de un SVG más grande: sin márgenes, el punto final quedaba
// cortado al medio contra el borde y las etiquetas del eje no tenían dónde ir.
const PLOT = { width: 264, height: 150 }
const MARGIN = { top: 12, right: 12, bottom: 24, left: 44 }
const SVG = {
  width: PLOT.width + MARGIN.left + MARGIN.right,
  height: PLOT.height + MARGIN.top + MARGIN.bottom,
}
const DOT_RADIUS = 12 // radio del área táctil invisible por punto (24px de diámetro)

export function SlrdLineChart({ points }: { points: SlrdHistoryPoint[] }) {
  // Dos estados independientes: `pinnedDate` es el punto fijado por click
  // (toggle, persiste al sacar el mouse) y `hoveredDate` es el punto bajo
  // el cursor (solo desktop). El pineado tiene prioridad sobre el hover.
  const [pinnedDate, setPinnedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const chart = buildChart(points, PLOT)
  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]

  const activeDate = pinnedDate ?? hoveredDate
  const active = points.find((p) => p.snapshotDate === activeDate) ?? null

  function togglePinned(point: SlrdHistoryPoint) {
    setPinnedDate((current) => {
      if (current === point.snapshotDate) {
        // Clic explícito para cerrar: gana por sobre un hover que siga activo
        // en el mismo punto (el mouse no se movió entre los dos clicks).
        setHoveredDate((hovered) => (hovered === point.snapshotDate ? null : hovered))
        return null
      }
      return point.snapshotDate
    })
  }

  function closePinned() {
    setPinnedDate(null)
  }

  const lastX = chart.x(points.length - 1)
  const lastY = chart.y(lastPoint.slrdInmediato)

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${SVG.width} ${SVG.height}`}
        className="w-full h-auto"
        role="img"
        aria-label={`SLRD inmediato entre ${formatShortDate(firstPoint.snapshotDate)} y ${formatShortDate(lastPoint.snapshotDate)}`}
      >
        <rect
          x={0} y={0} width={SVG.width} height={SVG.height}
          fill="transparent"
          onClick={closePinned}
        />
        <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
          {chart.ticks.map((tick) => (
            <g key={tick}>
              {/* Sólida, no punteada: el punteado lee como umbral o proyección. */}
              <line x1={0} y1={chart.y(tick)} x2={PLOT.width} y2={chart.y(tick)}
                className="stroke-ink-line" strokeWidth={1} />
              <text x={-8} y={chart.y(tick)} dy="0.32em" textAnchor="end"
                className="fill-zinc-500 font-mono" fontSize={9}>{formatCLP(tick)}</text>
            </g>
          ))}

          <path d={chart.areaPath} className="fill-accent" opacity={0.08} />
          <path data-series="slrdInmediato" d={chart.path}
            fill="none" className="stroke-accent-bright" strokeWidth={2}
            strokeLinejoin="round" strokeLinecap="round" />

          {/* Anillo del color de la superficie para separar el punto de la línea. */}
          <circle cx={lastX} cy={lastY} r={4.5}
            className="fill-accent-bright stroke-ink-1" strokeWidth={2} />
          <text x={lastX} y={lastY - 10} textAnchor="end"
            className="fill-zinc-200 font-mono" fontSize={10}>
            {formatCLP(lastPoint.slrdInmediato)}
          </text>

          {points.map((p, i) => (
            <circle
              key={p.snapshotDate}
              data-testid={`point-${p.snapshotDate}`}
              cx={chart.x(i)} cy={chart.y(p.slrdInmediato)} r={DOT_RADIUS}
              fill="transparent"
              onMouseEnter={() => setHoveredDate(p.snapshotDate)}
              onMouseLeave={() => setHoveredDate(null)}
              onClick={() => togglePinned(p)}
            />
          ))}

          <text x={0} y={PLOT.height + 16} className="fill-zinc-500" fontSize={9}
            data-testid="chart-first-date">{formatShortDate(firstPoint.snapshotDate)}</text>
          <text x={PLOT.width} y={PLOT.height + 16} textAnchor="end"
            className="fill-zinc-500" fontSize={9}
            data-testid="chart-last-date">{formatShortDate(lastPoint.snapshotDate)}</text>
        </g>
      </svg>

      {active && (
        <div data-testid="tooltip" className="mt-3 p-3 rounded-lg border border-ink-line text-sm">
          <p className="text-zinc-400" data-testid="tooltip-date">{active.snapshotDate}</p>
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

Notas:
- Desaparecen la leyenda (`— SLRD inmediato` / `- - saldo contable`) y los dos `<div>` de `yMax`/`yMin` que estaban fuera del SVG: los reemplazan los ticks.
- El `data-testid="tooltip"` es lo que permite acotar las aserciones de monto.

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npx vitest run src/data/chartScale.test.ts src/features/historial/SlrdLineChart.test.tsx`
Expected: PASS en los dos archivos.

Después la suite entera: `npm test && npx tsc --noEmit && npm run lint`
Expected: todo verde. Acá sí: la unidad atómica está completa.

- [ ] **Step 7: Verificar en el navegador**

Con `mibanko-dev` corriendo, viewport 375×812, navegar a `/historial` (la tab SLRD es la default) y ejecutar:

```js
(() => {
  const svg = document.querySelector('svg[role="img"]')
  const alto = svg.viewBox.baseVal.height
  const d = svg.querySelector('[data-series="slrdInmediato"]').getAttribute('d')
  const ys = [...d.matchAll(/[ML] [\d.]+ ([\d.-]+)/g)].map(m => Number(m[1]))
  const recorrido = Math.max(...ys) - Math.min(...ys)
  const punto = svg.querySelector('circle[r="4.5"]').getBoundingClientRect()
  const caja = svg.getBoundingClientRect()
  return JSON.stringify({
    recorridoPx: +recorrido.toFixed(1),
    pctDelPlot: +((recorrido / 150) * 100).toFixed(1),
    hayContable: !!svg.querySelector('[data-series="saldoContable"]'),
    ticks: [...svg.querySelectorAll('text')].map(t => t.textContent).slice(0, 3),
    fechas: [document.querySelector('[data-testid="chart-first-date"]').textContent,
             document.querySelector('[data-testid="chart-last-date"]').textContent],
    puntoFinalEntero: punto.left >= caja.left && punto.right <= caja.right && punto.top >= caja.top,
  }, null, 1)
})()
```

Expected:
- `recorridoPx` > 50 (hoy es 0,7) y `pctDelPlot` > 30
- `hayContable` = false
- `ticks` = `["$120.000", "$110.000", "$100.000"]` o similar
- `fechas` = `["9 jul", "14 jul"]`
- `puntoFinalEntero` = true

Tomar screenshot como evidencia.

- [ ] **Step 8: Commit**

```bash
git add src/data/chartScale.ts src/data/chartScale.test.ts \
        src/features/historial/SlrdLineChart.tsx src/features/historial/SlrdLineChart.test.tsx
git commit -m "fix(historial): el gráfico del SLRD usa su propio eje"
```

---

## Verificación final

- [ ] `npm test` en verde
- [ ] `npx tsc --noEmit` sin errores
- [ ] `npm run lint` sin errores nuevos
- [ ] Recorrido de la línea > 50px (era 0,7)
- [ ] El saldo contable no está como serie pero sí en el tooltip
- [ ] El punto final se ve entero
- [ ] Tooltip y pin/hover siguen funcionando
