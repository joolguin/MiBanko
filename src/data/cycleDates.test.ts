import { describe, it, expect } from 'vitest'
import { deriveCycleDates } from './cycleDates'

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
})
