import { describe, it, expect } from 'vitest'
import { deriveCycleDates, cycleProgress } from './cycleDates'
import { santiagoToday } from './santiagoDate'

const config = { closingDay: 25, dueDay: 15 }

describe('deriveCycleDates', () => {
  it('should_DeriveCycle_When_ClosingMidMonthBeforeClosingDay', () => {
    // Cierro el 7-jul; el corte más reciente <= hoy es el 25-jun.
    expect(deriveCycleDates(config, new Date(Date.UTC(2026, 6, 7)))).toEqual({
      cycleStart: '2026-05-26', cycleEnd: '2026-06-25', dueDate: '2026-07-15',
    })
  })
  it('should_UseSameMonth_When_ClosingOnClosingDay', () => {
    expect(deriveCycleDates(config, new Date(Date.UTC(2026, 6, 25)))).toEqual({
      cycleStart: '2026-06-26', cycleEnd: '2026-07-25', dueDate: '2026-08-15',
    })
  })
  it('should_RollYear_When_ClosingInJanuaryBeforeClosingDay', () => {
    expect(deriveCycleDates(config, new Date(Date.UTC(2026, 0, 10)))).toEqual({
      cycleStart: '2025-11-26', cycleEnd: '2025-12-25', dueDate: '2026-01-15',
    })
  })
  it('should_DueSameMonth_When_DueDayAfterClosingDay', () => {
    // corte 5, vence 20 -> vencimiento en el mismo mes del corte.
    expect(deriveCycleDates({ closingDay: 5, dueDay: 20 }, new Date(Date.UTC(2026, 6, 10)))).toEqual({
      cycleStart: '2026-06-06', cycleEnd: '2026-07-05', dueDate: '2026-07-20',
    })
  })

  it('should_UseSantiagoDay_When_ClosingAtNightBeforeUtcRollsOver', () => {
    // Santiago 2026-06-24 23:00 (UTC−4) == 2026-06-25 03:00 UTC.
    // Localmente aún es el 24 (< closingDay 25): el corte más reciente es el 25-may.
    // Con new Date() crudo, getUTCDate leería 25 y saltaría al corte del 25-jun (bug).
    const instant = new Date('2026-06-25T03:00:00Z')
    expect(deriveCycleDates(config, santiagoToday(instant))).toEqual({
      cycleStart: '2026-04-26', cycleEnd: '2026-05-25', dueDate: '2026-06-15',
    })
  })
})

describe('cycleProgress', () => {
  it('should_CountFromDayAfterLastCut_When_MidCycle', () => {
    // Último corte 25-jun; ciclo abierto 26-jun..25-jul (30 días). El 16-jul es el día 21.
    expect(cycleProgress(config, new Date(Date.UTC(2026, 6, 16)))).toEqual({ day: 21, total: 30 })
  })
  it('should_BeFirstDay_When_DayAfterCut', () => {
    expect(cycleProgress(config, new Date(Date.UTC(2026, 6, 26)))).toEqual({ day: 1, total: 31 })
  })
  it('should_StartNextCycle_When_OnClosingDay', () => {
    // El día del corte, deriveCycleDates ya da por cerrado ese ciclo: el abierto
    // es 26-jul..25-ago (31 días) y todavía no arrancó -> clamp al día 1.
    expect(cycleProgress(config, new Date(Date.UTC(2026, 6, 25)))).toEqual({ day: 1, total: 31 })
  })
  it('should_ClampToTotal_When_ElapsedOverruns', () => {
    const p = cycleProgress(config, new Date(Date.UTC(2026, 1, 10)))
    expect(p.day).toBeLessThanOrEqual(p.total)
    expect(p.day).toBeGreaterThanOrEqual(1)
  })
})
