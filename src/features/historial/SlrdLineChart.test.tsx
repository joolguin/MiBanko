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

    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')
    expect(screen.getByText('$150')).toBeInTheDocument()
  })

  it('should_ToggleTooltip_When_PointTapped', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.click(screen.getByTestId('point-2026-07-09'))
    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')
    expect(screen.getByText('$150')).toBeInTheDocument()

    await user.click(screen.getByTestId('point-2026-07-09'))
    expect(screen.queryByTestId('tooltip-date')).not.toBeInTheDocument()
  })

  it('should_ShowMinMaxAxesAndFirstLastDates_When_GivenTwoOrMorePoints', () => {
    render(<SlrdLineChart points={points} />)

    expect(screen.getByText('$250')).toBeInTheDocument() // yMax: max(100,200,150,250)
    expect(screen.getByText('$100')).toBeInTheDocument() // yMin
    expect(screen.getByTestId('chart-first-date')).toHaveTextContent('2026-07-08')
    expect(screen.getByTestId('chart-last-date')).toHaveTextContent('2026-07-09')
  })
})
