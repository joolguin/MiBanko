import { describe, it, expect } from 'vitest'
import { isStale } from './freshness'

describe('isStale', () => {
  it('should_False_When_AgeNull', () => { expect(isStale(null, 4)).toBe(false) })
  it('should_False_When_AgeWithinLimit', () => { expect(isStale(4, 4)).toBe(false) })
  it('should_True_When_AgeOverLimit', () => { expect(isStale(5, 4)).toBe(true) })
})
