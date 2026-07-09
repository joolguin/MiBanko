import { describe, it, expect } from 'vitest'
import { mapSettingsRow } from './useUserSettings'

describe('mapSettingsRow', () => {
  it('should_Default4_When_NoRow', () => {
    expect(mapSettingsRow(null)).toEqual({ freshLimitDays: 4 })
  })
  it('should_MapValue_When_Row', () => {
    expect(mapSettingsRow({ fresh_limit_days: 10 })).toEqual({ freshLimitDays: 10 })
  })
})
