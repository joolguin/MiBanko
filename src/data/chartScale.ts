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
