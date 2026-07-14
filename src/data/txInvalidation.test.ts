import { describe, it, expect, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { TX_QUERY_KEYS, invalidateTxQueries } from './txInvalidation'

describe('invalidateTxQueries', () => {
  it('should_CoverAllStaleScreens_When_TransactionsMutate', () => {
    // Regla de la casa: toda mutación sobre transactions invalida estas cuatro keys.
    expect(TX_QUERY_KEYS).toEqual([
      ['slrd'],
      ['month-transactions'],
      ['slrd-history'],
      ['current-cycle'],
    ])
  })

  it('should_InvalidateEveryKey_When_Called', () => {
    const qc = new QueryClient()
    const spy = vi.spyOn(qc, 'invalidateQueries')

    invalidateTxQueries(qc)

    expect(spy.mock.calls.map(([f]) => f?.queryKey)).toEqual(TX_QUERY_KEYS)
  })
})
