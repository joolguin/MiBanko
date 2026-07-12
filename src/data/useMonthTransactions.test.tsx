import { describe, it, expect } from 'vitest'
import { mapMonthTxRow } from './useMonthTransactions'

describe('mapMonthTxRow', () => {
  it('should_MapRowWithJoins_When_GivenDbRow', () => {
    const row = {
      id: 't1', transaction_date: '2026-07-12', amount: '12000', type: 'gasto',
      channel: 'wallet_pixel', category_id: 'c1',
      categories: { name: 'Comida' },
      accounts: { name: 'BICE Visa', type: 'credit' },
    }

    expect(mapMonthTxRow(row)).toEqual({
      id: 't1', transactionDate: '2026-07-12', amount: 12000, type: 'gasto',
      channel: 'wallet_pixel', categoryId: 'c1', categoryName: 'Comida',
      accountName: 'BICE Visa', accountType: 'credit',
    })
  })

  it('should_NullCategory_When_CategoriesMissing', () => {
    const row = {
      id: 't2', transaction_date: '2026-07-01', amount: 900000, type: 'ingreso',
      channel: null, category_id: null, categories: null,
      accounts: { name: 'Santander', type: 'debit' },
    }

    const tx = mapMonthTxRow(row)

    expect(tx.categoryName).toBeNull()
    expect(tx.categoryId).toBeNull()
    expect(tx.channel).toBeNull()
  })
})
