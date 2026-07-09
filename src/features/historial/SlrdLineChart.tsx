import { useState } from 'react'
import { buildChart } from '../../data/chartScale'
import type { SlrdHistoryPoint } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'
import { formatCLP } from '../../lib/format'

const GEOMETRY = { width: 320, height: 160 }
const DOT_RADIUS = 10 // radio del área táctil invisible por punto

export function SlrdLineChart({ points }: { points: SlrdHistoryPoint[] }) {
  // Dos estados independientes: `pinnedDate` es el punto fijado por click
  // (toggle, persiste al sacar el mouse) y `hoveredDate` es el punto bajo
  // el cursor (solo desktop). El pineado tiene prioridad sobre el hover.
  const [pinnedDate, setPinnedDate] = useState<string | null>(null)
  const [hoveredDate, setHoveredDate] = useState<string | null>(null)
  const chart = buildChart(points, GEOMETRY)
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

  return (
    <div className="mt-4">
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>{formatCLP(chart.yMax)}</span>
      </div>
      <svg
        viewBox={`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`}
        className="w-full h-auto"
        role="img"
        aria-label="SLRD inmediato vs saldo contable en el tiempo"
      >
        <rect
          x={0} y={0} width={GEOMETRY.width} height={GEOMETRY.height}
          fill="transparent"
          onClick={closePinned}
        />
        <path data-series="saldoContable" d={chart.series[1].path}
          fill="none" className="stroke-zinc-500" strokeWidth={1.5} strokeDasharray="4 3" />
        <path data-series="slrdInmediato" d={chart.series[0].path}
          fill="none" className="stroke-accent-bright" strokeWidth={2} />
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
      </svg>
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>{formatCLP(chart.yMin)}</span>
      </div>
      <div className="flex justify-between mt-1 text-[11px] text-zinc-500">
        <span data-testid="chart-first-date">{firstPoint.snapshotDate}</span>
        <span data-testid="chart-last-date">{lastPoint.snapshotDate}</span>
      </div>

      <div className="flex gap-4 mt-2 text-[11px]">
        <span className="text-accent-bright">— SLRD inmediato</span>
        <span className="text-zinc-500">- - saldo contable</span>
      </div>

      {active && (
        <div className="mt-3 p-3 rounded-lg border border-ink-line text-sm">
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
