import { describe, it, expect } from 'vitest'
import { buildImportInserts, type ImportPayload } from './useImportTransactions'

describe('buildImportInserts', () => {
  it('should_BuildInsertRows_When_GivenPayload', () => {
    const payload: ImportPayload = {
      accountId: 'acc-bice', billingCycleId: null,
      rows: [
        { date: '2026-07-10', amount: 5500, description: 'Google Play', kind: 'gasto', categoryId: 'cat-hobbies' },
        { date: '2026-07-07', amount: 3250, description: 'Rosario Norte', kind: 'gasto', categoryId: null },
      ],
    }

    const inserts = buildImportInserts(payload)

    expect(inserts).toHaveLength(2)
    expect(inserts[0]).toEqual({
      account_id: 'acc-bice', type: 'gasto', amount: 5500,
      transaction_date: '2026-07-10', channel: null, category_id: 'cat-hobbies',
      description: 'Google Play', billing_cycle_id: null, source: 'import',
    })
    expect(inserts[1].category_id).toBeNull()
  })
})
