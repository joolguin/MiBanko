import { describe, it, expect } from 'vitest'
import { formatCLP, formatSignedCLP } from './format'

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
})
