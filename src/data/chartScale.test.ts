import { describe, it, expect } from 'vitest'
import { filterByRange, buildChart } from './chartScale'
import type { SlrdHistoryPoint } from './types'

function point(date: string, slrd: number, contable: number): SlrdHistoryPoint {
  return {
    snapshotDate: date,
    slrdInmediato: slrd, slrdTotal: slrd, saldoContable: contable,
    saldoDebito: 0, saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
  }
}

describe('filterByRange', () => {
  const today = new Date('2026-07-09T12:00:00-04:00')
  const points = [
    point('2026-01-01', 1, 1),
    point('2026-06-20', 2, 2), // ~19 días atrás
    point('2026-07-08', 3, 3), // ayer
  ]

  it('should_KeepOnlyLast30Days_When_Range30d', () => {
    const result = filterByRange(points, '30d', today)

    expect(result.map((p) => p.snapshotDate)).toEqual(['2026-06-20', '2026-07-08'])
  })

  it('should_KeepAll_When_RangeAll', () => {
    const result = filterByRange(points, 'all', today)

    expect(result).toHaveLength(3)
  })
})

describe('buildChart', () => {
  const geo = { width: 300, height: 100 }
  const points = [point('2026-07-08', 0, 100), point('2026-07-09', 50, 150)]

  it('should_ComputeDomainFromBothSeries_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.yMin).toBe(0)
    expect(chart.yMax).toBe(150)
  })

  it('should_MapFirstAndLastX_ToEdges', () => {
    const chart = buildChart(points, geo)

    expect(chart.x(0)).toBe(0)
    expect(chart.x(1)).toBe(300)
  })

  it('should_MapMaxValue_ToTopAndMinToBottom', () => {
    const chart = buildChart(points, geo)

    expect(chart.y(150)).toBe(0)   // valor máximo arriba (y=0)
    expect(chart.y(0)).toBe(100)   // valor mínimo abajo (y=height)
  })

  it('should_BuildTwoSeriesPaths_When_Built', () => {
    const chart = buildChart(points, geo)

    expect(chart.series.map((s) => s.key)).toEqual(['slrdInmediato', 'saldoContable'])
    expect(chart.series[0].path.startsWith('M')).toBe(true)
  })
})
