import { describe, it, expect } from 'vitest'
import { flagDuplicates } from './importDedup'
import type { RawMovement } from '../../parsers/types'
import type { ExistingTx } from '../../data/useImportPreview'

function mov(date: string, amount: number, description: string): RawMovement {
  return { date, amount, description, kind: 'gasto' }
}

describe('flagDuplicates', () => {
  it('should_FlagRow_When_MatchesExistingByDateAmountDescription', () => {
    const movements = [mov('2026-07-10', 5500, 'Google Play'), mov('2026-07-07', 3250, 'Rosario Norte')]
    const existing: ExistingTx[] = [{ transactionDate: '2026-07-10', amount: 5500, description: 'GOOGLE PLAY' }]

    expect(flagDuplicates(movements, existing)).toEqual([true, false])
  })

  it('should_NotFlag_When_AmountOrDateDiffers', () => {
    const movements = [mov('2026-07-10', 5500, 'Google Play')]
    const existing: ExistingTx[] = [
      { transactionDate: '2026-07-10', amount: 5501, description: 'Google Play' },
      { transactionDate: '2026-07-11', amount: 5500, description: 'Google Play' },
    ]

    expect(flagDuplicates(movements, existing)).toEqual([false])
  })
})
