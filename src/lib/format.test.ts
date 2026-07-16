import { describe, it, expect } from 'vitest'
import { formatCLP, formatSignedCLP, formatShortDate } from './format'

describe('formatCLP', () => {
  it('should_FormatThousands_When_PositiveInteger', () => {
    expect(formatCLP(487320)).toBe('$487.320')
  })
  it('should_RoundToNoDecimals_When_Fractional', () => {
    expect(formatCLP(1500.7)).toBe('$1.501')
  })
  it('should_ReturnZero_When_Zero', () => {
    expect(formatCLP(0)).toBe('$0')
  })
})

describe('formatSignedCLP', () => {
  it('should_PrependMinus_When_Negative', () => {
    expect(formatSignedCLP(-298900)).toBe('−$298.900')
  })
  it('should_NoSign_When_Positive', () => {
    expect(formatSignedCLP(2000)).toBe('$2.000')
  })
  it('should_PrependPlus_When_PositiveAndWithPlus', () => {
    expect(formatSignedCLP(900000, true)).toBe('+$900.000')
  })
  it('should_NoPlus_When_ZeroAndWithPlus', () => {
    expect(formatSignedCLP(0, true)).toBe('$0')
  })
})

describe('formatShortDate', () => {
  it('should_FormatDayAndShortMonth', () => {
    expect(formatShortDate('2026-07-09')).toBe('9 jul')
  })

  it('should_StripLeadingZero_When_DayIsSingleDigit', () => {
    expect(formatShortDate('2026-01-05')).toBe('5 ene')
  })

  it('should_FormatLastMonth_When_December', () => {
    expect(formatShortDate('2026-12-31')).toBe('31 dic')
  })

  // Con `new Date('2026-03-01')` (medianoche UTC) + toLocaleDateString en
  // Santiago (UTC−3/−4) esto daría "28 feb": la fecha se corre un día.
  it('should_NotShiftDay_When_FirstOfMonth', () => {
    expect(formatShortDate('2026-03-01')).toBe('1 mar')
  })
})
