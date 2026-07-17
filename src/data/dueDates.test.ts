import { describe, it, expect } from 'vitest'
import { daysUntil, dueDistanceLabel } from './dueDates'

const today = new Date('2026-07-16T00:00:00Z')

describe('daysUntil', () => {
  it('should_ReturnPositive_When_DateIsInTheFuture', () => {
    expect(daysUntil('2026-07-19', today)).toBe(3)
  })
  it('should_ReturnZero_When_DateIsToday', () => {
    expect(daysUntil('2026-07-16', today)).toBe(0)
  })
  it('should_ReturnNegative_When_DateAlreadyPassed', () => {
    expect(daysUntil('2026-07-14', today)).toBe(-2)
  })
  it('should_CrossMonthBoundary_When_DateIsNextMonth', () => {
    expect(daysUntil('2026-08-01', today)).toBe(16)
  })
})

describe('dueDistanceLabel', () => {
  it('should_SayEnNDias_When_MoreThanOneDayLeft', () => {
    expect(dueDistanceLabel(3)).toBe('en 3 días')
  })
  it('should_SayManana_When_OneDayLeft', () => {
    expect(dueDistanceLabel(1)).toBe('mañana')
  })
  it('should_SayHoy_When_DueToday', () => {
    expect(dueDistanceLabel(0)).toBe('hoy')
  })
  it('should_SayAyer_When_OneDayOverdue', () => {
    expect(dueDistanceLabel(-1)).toBe('ayer')
  })
  it('should_SayHaceNDias_When_SeveralDaysOverdue', () => {
    expect(dueDistanceLabel(-4)).toBe('hace 4 días')
  })
})
