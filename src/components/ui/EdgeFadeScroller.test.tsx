import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EdgeFadeScroller } from './EdgeFadeScroller'

describe('EdgeFadeScroller', () => {
  it('should_RenderChildren_When_Given', () => {
    render(<EdgeFadeScroller><span>hola</span></EdgeFadeScroller>)
    expect(screen.getByText('hola')).toBeInTheDocument()
  })

  it('should_BeHorizontallyScrollable', () => {
    render(<EdgeFadeScroller><span>hola</span></EdgeFadeScroller>)
    const scroller = screen.getByTestId('edge-fade-scroller')
    expect(scroller.className).toContain('overflow-x-auto')
  })

  it('should_MergeExtraClassName', () => {
    render(<EdgeFadeScroller className="mt-3"><span>hola</span></EdgeFadeScroller>)
    expect(screen.getByTestId('edge-fade-scroller').className).toContain('mt-3')
  })
})
