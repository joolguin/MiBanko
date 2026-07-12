import { describe, it, expect } from 'vitest'
import { computeCategoryAverages } from './categoryAverages'
import type { MonthTx } from './types'

const WINDOW = ['2026-04', '2026-05', '2026-06']

function gasto(categoryId: string | null, amount: number, month: string): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: `${month}-15`, amount,
    type: 'gasto', categoryId, channel: null, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

describe('computeCategoryAverages', () => {
  it('should_AverageOverWindow_When_CategoryInEveryMonth', () => {
    const rows = [gasto('c1', 30, '2026-04'), gasto('c1', 30, '2026-05'), gasto('c1', 30, '2026-06')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 30, monthsCounted: 3 })
  })

  it('should_DivideByFullWindow_When_CategoryMissingSomeMonths', () => {
    // c1 aparece en 04 y 06; c2 da actividad en 05 -> 3 meses con actividad
    const rows = [gasto('c1', 60, '2026-04'), gasto('c1', 60, '2026-06'), gasto('c2', 10, '2026-05')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 40, monthsCounted: 3 })
  })

  it('should_DivideByAvailableMonths_When_HistoryShorterThanWindow', () => {
    const rows = [gasto('c1', 50, '2026-05'), gasto('c1', 50, '2026-06')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 50, monthsCounted: 2 })
  })

  it('should_IgnoreOutOfWindowMonths', () => {
    const rows = [gasto('c1', 999, '2026-01'), gasto('c1', 30, '2026-06')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 30, monthsCounted: 1 })
  })

  it('should_IgnoreNonGastoAndUncategorized', () => {
    const income: MonthTx = { ...gasto('c1', 1000, '2026-05'), type: 'ingreso' }
    const uncategorized = gasto(null, 500, '2026-05')
    const rows = [income, uncategorized, gasto('c1', 20, '2026-05')]

    expect(computeCategoryAverages(rows, 3, WINDOW).get('c1')).toEqual({ avg: 20, monthsCounted: 1 })
  })

  it('should_ReturnEmpty_When_NoQualifyingSpend', () => {
    const rows = [gasto(null, 500, '2026-05'), { ...gasto('c1', 100, '2026-05'), type: 'ingreso' as const }]

    expect(computeCategoryAverages(rows, 3, WINDOW).size).toBe(0)
  })
})
