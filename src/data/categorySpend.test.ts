import { describe, it, expect } from 'vitest'
import { computeCategorySpend } from './categorySpend'
import type { MonthTx } from './types'

function gasto(category: string | null, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryName: category,
    accountName: 'BICE', accountType: 'credit',
  }
}

describe('computeCategorySpend', () => {
  it('should_GroupSortAndComputePct_When_GivenGastos', () => {
    const result = computeCategorySpend([
      gasto('Comida', 60), gasto('Comida', 20), gasto('Ocio', 20),
    ])

    expect(result).toEqual([
      { label: 'Comida', amount: 80, pct: 80 },
      { label: 'Ocio', amount: 20, pct: 20 },
    ])
  })

  it('should_LabelNullCategoryAsSinCategoria', () => {
    const result = computeCategorySpend([gasto(null, 100)])

    expect(result[0].label).toBe('Sin categoría')
  })

  it('should_IgnoreNonGasto', () => {
    const income: MonthTx = { ...gasto('Sueldo', 1000), type: 'ingreso' }

    expect(computeCategorySpend([income, gasto('Comida', 50)])).toEqual([
      { label: 'Comida', amount: 50, pct: 100 },
    ])
  })

  it('should_CollapseIntoOtros_When_MoreThanTopCategories', () => {
    const txs = [
      gasto('A', 70), gasto('B', 60), gasto('C', 50), gasto('D', 40),
      gasto('E', 30), gasto('F', 20), gasto('G', 10), gasto('H', 5),
    ]

    const result = computeCategorySpend(txs)

    expect(result).toHaveLength(7) // 6 top + Otros
    expect(result[6]).toEqual({ label: 'Otros', amount: 15, pct: (15 / 285) * 100 })
  })

  it('should_ReturnEmpty_When_NoGastos', () => {
    expect(computeCategorySpend([])).toEqual([])
  })
})
