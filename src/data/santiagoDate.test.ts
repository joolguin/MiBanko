import { describe, it, expect } from 'vitest'
import { santiagoDateKey, santiagoToday } from './santiagoDate'

describe('santiagoDateKey', () => {
  it('should_ReturnPreviousDay_When_NightInSantiagoIsNextDayInUtc', () => {
    // Santiago 2026-07-07 22:00 (UTC−4 en invierno) == 2026-07-08 02:00 UTC.
    // El día de calendario en Santiago sigue siendo el 7.
    expect(santiagoDateKey(new Date('2026-07-08T02:00:00Z'))).toBe('2026-07-07')
  })

  it('should_ReturnSameDay_When_DaytimeInSantiago', () => {
    expect(santiagoDateKey(new Date('2026-07-08T12:00:00Z'))).toBe('2026-07-08')
  })
})

describe('santiagoToday', () => {
  it('should_ReturnUtcDayOnlyDate_MatchingSantiagoCalendarDate', () => {
    // Misma noche del borde: los getters UTC deben leer el 7, no el 8.
    const d = santiagoToday(new Date('2026-07-08T02:00:00Z'))
    expect(d.getUTCFullYear()).toBe(2026)
    expect(d.getUTCMonth()).toBe(6) // julio (0-based)
    expect(d.getUTCDate()).toBe(7)
    expect(d.getUTCHours()).toBe(0)
  })
})
