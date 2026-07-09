import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CategoryDonut, segmentColor, OTHER_COLOR } from './CategoryDonut'
import type { CategorySpendSegment } from '../../data/types'

describe('segmentColor', () => {
  it('should_UseOtherColor_When_SegmentIsOther', () => {
    expect(segmentColor(true, 3)).toBe(OTHER_COLOR)
  })

  it('should_UsePaletteByIndex_When_RealCategory', () => {
    expect(segmentColor(false, 0)).not.toBe(OTHER_COLOR)
  })
})

describe('CategoryDonut', () => {
  it('should_RenderOneArcPerSegment', () => {
    const segments: CategorySpendSegment[] = [
      { label: 'Comida', amount: 80, pct: 80, isOther: false },
      { label: 'Ocio', amount: 20, pct: 20, isOther: false },
    ]

    const { container } = render(<CategoryDonut segments={segments} />)

    expect(container.querySelectorAll('circle[data-arc]')).toHaveLength(2)
  })
})
