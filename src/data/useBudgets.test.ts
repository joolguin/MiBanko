import { describe, it, expect } from 'vitest'
import { mapBudgetRow } from './useBudgets'

describe('mapBudgetRow', () => {
  it('should_MapRow_When_GivenDbRow', () => {
    const row = { id: 'b1', category_id: 'c1', amount: 150000 }

    expect(mapBudgetRow(row)).toEqual({ id: 'b1', categoryId: 'c1', amount: 150000 })
  })

  it('should_CoerceAmountToNumber_When_AmountIsString', () => {
    const row = { id: 'b2', category_id: 'c2', amount: '90000' }

    expect(mapBudgetRow(row).amount).toBe(90000)
  })
})
