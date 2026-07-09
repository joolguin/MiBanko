import { describe, it, expect } from 'vitest'
import { currentMonthKey, shiftMonth, monthLabel, monthRange } from './monthNav'

describe('currentMonthKey', () => {
  it('should_ReturnMonthInSantiago_When_GivenUtcInstant', () => {
    // 2026-08-01T02:00Z es 2026-07-31 22:00 en Santiago (UTC-4) -> mes 2026-07
    const key = currentMonthKey(new Date('2026-08-01T02:00:00Z'))

    expect(key).toBe('2026-07')
  })
})

describe('shiftMonth', () => {
  it('should_GoToNextMonth_When_DeltaIsPlusOne', () => {
    expect(shiftMonth('2026-07', 1)).toBe('2026-08')
  })

  it('should_RollOverYear_When_December', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('should_RollBackYear_When_January', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('monthLabel', () => {
  it('should_ReturnCapitalizedSpanishLabel', () => {
    expect(monthLabel('2026-07')).toBe('Julio 2026')
  })
})

describe('monthRange', () => {
  it('should_ReturnHalfOpenRange_When_GivenMonth', () => {
    expect(monthRange('2026-07')).toEqual({ start: '2026-07-01', endExclusive: '2026-08-01' })
  })

  it('should_RollOverYear_When_December', () => {
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' })
  })
})
