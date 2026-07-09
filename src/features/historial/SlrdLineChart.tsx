import { useState } from 'react'
import { buildChart } from '../../data/chartScale'
import type { SlrdHistoryPoint } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'

const GEOMETRY = { width: 320, height: 160 }
const DOT_RADIUS = 10 // radio del área táctil invisible por punto

export function SlrdLineChart({ points }: { points: SlrdHistoryPoint[] }) {
  const [active, setActive] = useState<SlrdHistoryPoint | null>(null)
  const chart = buildChart(points, GEOMETRY)

  return (
    <div className="mt-4">
      <svg
        viewBox={`0 0 ${GEOMETRY.width} ${GEOMETRY.height}`}
        className="w-full h-auto"
        role="img"
        aria-label="SLRD inmediato vs saldo contable en el tiempo"
      >
        <path data-series="saldoContable" d={chart.series[1].path}
          fill="none" stroke="#52525b" strokeWidth={1.5} strokeDasharray="4 3" />
        <path data-series="slrdInmediato" d={chart.series[0].path}
          fill="none" stroke="#34d399" strokeWidth={2} />
        {points.map((p, i) => (
          <circle
            key={p.snapshotDate}
            data-testid={`point-${p.snapshotDate}`}
            cx={chart.x(i)} cy={chart.y(p.slrdInmediato)} r={DOT_RADIUS}
            fill="transparent"
            onMouseEnter={() => setActive(p)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </svg>

      <div className="flex gap-4 mt-2 text-[11px]">
        <span className="text-accent-bright">— SLRD inmediato</span>
        <span className="text-zinc-500">- - saldo contable</span>
      </div>

      {active && (
        <div className="mt-3 p-3 rounded-lg border border-ink-line text-sm">
          <p className="text-zinc-400">{active.snapshotDate}</p>
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
