import { describe, it, expect } from 'vitest'
import { donutDashes } from './donutGeometry'
import type { CategorySpendSegment } from './types'

function seg(label: string, pct: number): CategorySpendSegment {
  return { label, amount: pct, pct }
}

describe('donutDashes', () => {
  it('should_ComputeDashAndCumulativeOffset_When_GivenSegments', () => {
    const result = donutDashes([seg('A', 60), seg('B', 40)], 100)

    expect(result).toEqual([
      { label: 'A', pct: 60, dash: 60, offset: -0 },
      { label: 'B', pct: 40, dash: 40, offset: -60 },
    ])
  })

  it('should_ReturnEmpty_When_NoSegments', () => {
    expect(donutDashes([], 100)).toEqual([])
  })

  it('should_SumDashesToCircumference_When_SegmentsCoverAll', () => {
    const result = donutDashes([seg('A', 25), seg('B', 25), seg('C', 50)], 360)
    const totalDash = result.reduce((sum, d) => sum + d.dash, 0)

    expect(totalDash).toBeCloseTo(360)
  })
})
