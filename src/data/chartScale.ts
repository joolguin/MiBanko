import { santiagoDateKey } from './santiagoDate'
import type { SlrdHistoryPoint } from './types'

export type ChartRange = '30d' | '90d' | 'all'

const RANGE_DAYS: Record<Exclude<ChartRange, 'all'>, number> = { '30d': 30, '90d': 90 }
const MS_PER_DAY = 86_400_000

// Aritmética de calendario en UTC puro: al operar sobre 'AAAA-MM-DD' no hay
// corrimiento por DST (Chile alterna −03/−04), y como snapshot_date es date,
// la comparación es exacta a granularidad de día.
function dayNumber(dateKey: string): number {
  return Math.floor(new Date(`${dateKey}T00:00:00Z`).getTime() / MS_PER_DAY)
}

function subtractDays(dateKey: string, days: number): string {
  const shifted = new Date(`${dateKey}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() - days)
  return shifted.toISOString().slice(0, 10)
}

export function filterByRange(
  points: SlrdHistoryPoint[],
  range: ChartRange,
  today: Date,
): SlrdHistoryPoint[] {
  if (range === 'all') return points
  const cutoff = subtractDays(santiagoDateKey(today), RANGE_DAYS[range])
  return points.filter((p) => p.snapshotDate >= cutoff)
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

  // Eje X proporcional a la fecha real (no al índice): los días faltantes dejan
  // un hueco proporcional en vez de equiespaciar los puntos. points viene ordenado
  // ascendente por fecha, así que el primero y el último son los extremos temporales.
  const firstDay = dayNumber(points[0].snapshotDate)
  const daySpan = dayNumber(points[points.length - 1].snapshotDate) - firstDay || 1

  const x = (i: number) => ((dayNumber(points[i].snapshotDate) - firstDay) / daySpan) * geo.width
  const y = (value: number) => geo.height - ((value - yMin) / span) * geo.height

  const series: Series[] = SERIES_KEYS.map((key) => ({
    key,
    path: points
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p[key])}`)
      .join(' '),
  }))

  return { yMin, yMax, series, x, y }
}
