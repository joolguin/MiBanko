import { describe, it, expect } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { CountUp } from './CountUp'

describe('CountUp', () => {
  it('should_RenderTypographicMinusBeforeDollarSign_When_ValueIsNegative', async () => {
    const { container } = render(<CountUp value={-298900} />)

    // El '$-...' malformado (formatCLP crudo) nunca debe aparecer.
    expect(container.textContent).not.toContain('$-')

    await waitFor(
      () => {
        expect(container.textContent).toBe('−$298.900')
      },
      { timeout: 5000, interval: 100 },
    )
  })
})
