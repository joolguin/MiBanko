import type { SlrdHistoryPoint } from './types'

export type ChartRange = '30d' | '90d' | 'all'

const RANGE_DAYS: Record<Exclude<ChartRange, 'all'>, number> = { '30d': 30, '90d': 90 }
const MS_PER_DAY = 86_400_000

export function filterByRange(
  points: SlrdHistoryPoint[],
  range: ChartRange,
  today: Date,
): SlrdHistoryPoint[] {
  if (range === 'all') return points
  const cutoff = today.getTime() - RANGE_DAYS[range] * MS_PER_DAY
  return points.filter((p) => new Date(`${p.snapshotDate}T00:00:00-04:00`).getTime() >= cutoff)
}

export interface ChartGeometry {
  width: number
  height: number
}

export interface Series {
  key: 'slrdInmediato' | 'saldoContable'
  path: string
}

const SERIES_KEYS: Series['key'][] = ['slrdInmediato', 'saldoContable']

export function buildChart(points: SlrdHistoryPoint[], geo: ChartGeometry) {
  const values = points.flatMap((p) => [p.slrdInmediato, p.saldoContable])
  const yMin = Math.min(...values)
  const yMax = Math.max(...values)
  const span = yMax - yMin || 1 // evita división por cero con una sola muestra plana
  const lastIndex = points.length - 1 || 1

  const x = (i: number) => (i / lastIndex) * geo.width
  const y = (value: number) => geo.height - ((value - yMin) / span) * geo.height

  const series: Series[] = SERIES_KEYS.map((key) => ({
    key,
    path: points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`)
      .join(' '),
  }))

  return { yMin, yMax, series, x, y }
}
