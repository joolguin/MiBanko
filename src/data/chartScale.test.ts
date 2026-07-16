import { describe, it, expect } from 'vitest'
import { filterByRange, buildChart, niceDomain } from './chartScale'
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

  it('should_IncludeBoundaryDay_When_ExactlyNDaysAgo', () => {
    // today 2026-07-09 en Santiago; 30d atrás = 2026-06-09 (borde inclusivo).
    const boundary = filterByRange([point('2026-06-09', 1, 1)], '30d', today)

    expect(boundary).toHaveLength(1)
  })
})

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

  it('should_SpaceXByRealDate_When_DaysAreMissing', () => {
    // 08 → 09 → 13: el punto del medio (1 de 5 días) va al 20% del ancho, no al 50%.
    const gapped = [
      point('2026-07-08', 0, 0), point('2026-07-09', 0, 0), point('2026-07-13', 0, 0),
    ]

    const chart = buildChart(gapped, geo)

    expect(chart.x(0)).toBe(0)
    expect(chart.x(1)).toBeCloseTo(60)  // (1/5) * 300
    expect(chart.x(2)).toBe(300)
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
