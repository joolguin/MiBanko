import { describe, it, expect } from 'vitest'
import { budgetHint } from './budgetHint'
import type { MonthTx, Budget } from './types'

function gasto(categoryId: string | null, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', channel: null, categoryId, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

const budgets: Budget[] = [{ id: 'b1', categoryId: 'c1', amount: 100 }]

describe('budgetHint', () => {
  it('should_ReturnNull_When_NoCategory', () => {
    expect(budgetHint(null, 50, [], budgets, 'X')).toBeNull()
  })

  it('should_ReturnNull_When_AmountZero', () => {
    expect(budgetHint('c1', 0, [], budgets, 'Super')).toBeNull()
  })

  it('should_ReturnNull_When_CategoryHasNoBudget', () => {
    expect(budgetHint('c2', 50, [], budgets, 'Ocio')).toBeNull()
  })

  it('should_ReturnNull_When_StaysBelowWarn', () => {
    // 0 previo + 50 = 50% < 80%
    expect(budgetHint('c1', 50, [], budgets, 'Super')).toBeNull()
  })

  it('should_ReturnWarn_When_CrossesInto80', () => {
    // 0 previo + 85 = 85% => warn (cruza desde ok)
    const hint = budgetHint('c1', 85, [], budgets, 'Super')

    expect(hint).toMatchObject({ categoryName: 'Super', projectedSpent: 85, amount: 100, state: 'warn' })
    expect(hint!.pct).toBeCloseTo(0.85)
  })

  it('should_ReturnOver_When_CrossesFromWarnToOver', () => {
    // 85 previo (warn) + 20 = 105% => over (cruza de warn a over)
    const hint = budgetHint('c1', 20, [gasto('c1', 85)], budgets, 'Super')

    expect(hint).toMatchObject({ state: 'over' })
  })

  it('should_ReturnNull_When_AlreadyOverAndStaysOver', () => {
    // 110 previo (over) + 5 sigue over => no re-molesta (no cruza)
    expect(budgetHint('c1', 5, [gasto('c1', 110)], budgets, 'Super')).toBeNull()
  })
})
