import { describe, it, expect } from 'vitest'
import { computeBudgetStatus, categoriesWithoutBudget, budgetState } from './budgetStatus'
import type { MonthTx, Budget, Category } from './types'

function gasto(categoryId: string | null, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryId, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

const cats: Category[] = [
  { id: 'c1', name: 'Supermercado' },
  { id: 'c2', name: 'Ocio' },
]

describe('budgetState', () => {
  it('should_ReturnOk_When_Below80', () => { expect(budgetState(0.79)).toBe('ok') })
  it('should_ReturnWarn_When_At80', () => { expect(budgetState(0.8)).toBe('warn') })
  it('should_ReturnWarn_When_At99', () => { expect(budgetState(0.99)).toBe('warn') })
  it('should_ReturnOver_When_At100', () => { expect(budgetState(1.0)).toBe('over') })
  it('should_ReturnOver_When_Above100', () => { expect(budgetState(1.05)).toBe('over') })
})

describe('computeBudgetStatus', () => {
  it('should_SumGastoByCategory_When_MatchingBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]
    const result = computeBudgetStatus([gasto('c1', 60), gasto('c1', 20)], budgets, cats)

    expect(result).toEqual([
      { categoryId: 'c1', categoryName: 'Supermercado', amount: 100, spent: 80, pct: 0.8, state: 'warn' },
    ])
  })

  it('should_ExcludeUncategorizedSpend_When_Summing', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]
    const result = computeBudgetStatus([gasto(null, 50), gasto('c1', 30)], budgets, cats)

    expect(result[0].spent).toBe(30)
  })

  it('should_IgnoreNonGasto_When_Summing', () => {
    const income: MonthTx = { ...gasto('c1', 1000), type: 'ingreso' }
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]

    expect(computeBudgetStatus([income, gasto('c1', 40)], budgets, cats)[0].spent).toBe(40)
  })

  it('should_MarkOver_When_SpentExceedsBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]
    const result = computeBudgetStatus([gasto('c1', 105)], budgets, cats)

    expect(result[0].state).toBe('over')
    expect(result[0].pct).toBeCloseTo(1.05)
  })

  it('should_ZeroSpent_When_NoTxForBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c2', amount: 100 }]
    const result = computeBudgetStatus([gasto('c1', 50)], budgets, cats)

    expect(result[0]).toMatchObject({ categoryId: 'c2', spent: 0, pct: 0, state: 'ok' })
  })

  it('should_SortByPctDesc_When_MultipleBudgets', () => {
    const budgets: Budget[] = [
      { id: 'b1', categoryId: 'c1', amount: 100 },
      { id: 'b2', categoryId: 'c2', amount: 100 },
    ]
    const result = computeBudgetStatus([gasto('c1', 20), gasto('c2', 90)], budgets, cats)

    expect(result.map((r) => r.categoryId)).toEqual(['c2', 'c1'])
  })
})

describe('categoriesWithoutBudget', () => {
  it('should_ReturnCategoriesWithNoBudget', () => {
    const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]

    expect(categoriesWithoutBudget(cats, budgets)).toEqual([{ id: 'c2', name: 'Ocio' }])
  })
})
