import { useState } from 'react'
import { buildChart } from '../../data/chartScale'
import type { SlrdHistoryPoint } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'
import { formatCLP, formatShortDate } from '../../lib/format'

// El plot vive adentro de un SVG más grande: sin márgenes, el punto final quedaba
// cortado al medio contra el borde y las etiquetas del eje no tenían dónde ir.
// left=64 lo dicta la etiqueta más ancha del eje: "$120.000" mide 43px y con 44
// arrancaba en x=-7, o sea que el "$" quedaba recortado. Los 64 dejan lugar hasta
// un SLRD de siete cifras ("$1.200.000").
const PLOT = { width: 244, height: 150 }
const MARGIN = { top: 12, right: 12, bottom: 24, left: 64 }
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
