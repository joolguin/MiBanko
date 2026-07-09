import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CategoryDonut, segmentColor, OTHER_COLOR } from './CategoryDonut'
import type { CategorySpendSegment } from '../../data/types'

describe('segmentColor', () => {
  it('should_UseOtherColor_When_LabelIsOtros', () => {
    expect(segmentColor('Otros', 3)).toBe(OTHER_COLOR)
  })

  it('should_UsePaletteByIndex_When_RealCategory', () => {
    expect(segmentColor('Comida', 0)).not.toBe(OTHER_COLOR)
  })
})

describe('CategoryDonut', () => {
  it('should_RenderOneArcPerSegment', () => {
    const segments: CategorySpendSegment[] = [
      { label: 'Comida', amount: 80, pct: 80 },
      { label: 'Ocio', amount: 20, pct: 20 },
    ]

    const { container } = render(<CategoryDonut segments={segments} />)

    expect(container.querySelectorAll('circle[data-arc]')).toHaveLength(2)
  })
})
