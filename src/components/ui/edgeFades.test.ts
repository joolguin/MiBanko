import { describe, it, expect } from 'vitest'
import { edgeFades, maskImageFor } from './edgeFades'

describe('edgeFades', () => {
  it('should_ReturnNoFades_When_NoOverflow', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 300, clientWidth: 300 }))
      .toEqual({ left: false, right: false })
  })

  it('should_FadeRightOnly_When_AtStartWithOverflow', () => {
    expect(edgeFades({ scrollLeft: 0, scrollWidth: 500, clientWidth: 300 }))
      .toEqual({ left: false, right: true })
  })

  it('should_FadeBoth_When_ScrolledInMiddle', () => {
    expect(edgeFades({ scrollLeft: 100, scrollWidth: 500, clientWidth: 300 }))
      .toEqual({ left: true, right: true })
  })

  it('should_FadeLeftOnly_When_ScrolledToEnd', () => {
    expect(edgeFades({ scrollLeft: 200, scrollWidth: 500, clientWidth: 300 }))
      .toEqual({ left: true, right: false })
  })
})

describe('maskImageFor', () => {
  it('should_ReturnUndefined_When_NoFades', () => {
    expect(maskImageFor({ left: false, right: false })).toBeUndefined()
  })

  it('should_MaskRightEdge_When_RightOnly', () => {
    expect(maskImageFor({ left: false, right: true }))
      .toBe('linear-gradient(to right, #000 calc(100% - 24px), transparent)')
  })

  it('should_MaskLeftEdge_When_LeftOnly', () => {
    expect(maskImageFor({ left: true, right: false }))
      .toBe('linear-gradient(to right, transparent, #000 24px)')
  })

  it('should_MaskBothEdges_When_Both', () => {
    expect(maskImageFor({ left: true, right: true }))
      .toBe('linear-gradient(to right, transparent, #000 24px, #000 calc(100% - 24px), transparent)')
  })
})
