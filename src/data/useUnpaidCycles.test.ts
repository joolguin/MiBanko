import { describe, it, expect } from 'vitest'
import { mapCycleRow } from './useUnpaidCycles'

describe('mapCycleRow', () => {
  it('should_MapStringNumericAndCamel_When_RowFromSupabase', () => {
    const row = {
      id: 'c1', cycle_start: '2026-05-26', cycle_end: '2026-06-25',
      due_date: '2026-07-15', billed_amount: '300000', is_paid: false,
    }
    expect(mapCycleRow(row)).toEqual({
      id: 'c1', cycleStart: '2026-05-26', cycleEnd: '2026-06-25',
      dueDate: '2026-07-15', billedAmount: 300000, isPaid: false,
    })
  })
})
