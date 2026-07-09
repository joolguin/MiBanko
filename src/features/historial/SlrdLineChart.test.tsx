import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SlrdLineChart } from './SlrdLineChart'
import type { SlrdHistoryPoint } from '../../data/types'

function point(date: string, slrd: number, contable: number): SlrdHistoryPoint {
  return {
    snapshotDate: date,
    slrdInmediato: slrd, slrdTotal: slrd, saldoContable: contable,
    saldoDebito: 0, saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
  }
}

describe('SlrdLineChart', () => {
  const points = [point('2026-07-08', 100, 200), point('2026-07-09', 150, 250)]

  it('should_RenderTwoSeriesPaths_When_GivenPoints', () => {
    const { container } = render(<SlrdLineChart points={points} />)

    expect(container.querySelectorAll('path[data-series]')).toHaveLength(2)
  })

  it('should_ShowTooltipWithBreakdown_When_PointHovered', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.hover(screen.getByTestId('point-2026-07-09'))

    expect(screen.getByText('2026-07-09')).toBeInTheDocument()
    expect(screen.getByText('$150')).toBeInTheDocument()
  })
})
