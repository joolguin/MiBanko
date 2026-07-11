import { describe, it, expect } from 'vitest'
import { mapExistingTxRow } from './useImportPreview'

describe('mapExistingTxRow', () => {
  it('should_MapDbRow_When_GivenExistingTransaction', () => {
    const row = { transaction_date: '2026-07-10', amount: '5500', description: 'Google Play' }

    expect(mapExistingTxRow(row)).toEqual({
      transactionDate: '2026-07-10', amount: 5500, description: 'Google Play',
    })
  })

  it('should_KeepNullDescription_When_Missing', () => {
    const row = { transaction_date: '2026-07-01', amount: 3250, description: null }
    expect(mapExistingTxRow(row).description).toBeNull()
  })
})
