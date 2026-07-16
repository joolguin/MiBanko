import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
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

  it('should_RenderOnlyTheSlrdSeries_When_GivenPoints', () => {
    const { container } = render(<SlrdLineChart points={points} />)

    expect(container.querySelectorAll('path[data-series]')).toHaveLength(1)
    expect(container.querySelector('path[data-series="saldoContable"]')).toBeNull()
  })

  // Los montos se acotan al tooltip: con los ticks del eje y la etiqueta directa
  // del último punto, '$150' aparece varias veces y getByText sería ambiguo.
  it('should_ShowTooltipWithBreakdown_When_PointHovered', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.hover(screen.getByTestId('point-2026-07-09'))

    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')
    expect(within(screen.getByTestId('tooltip')).getByText('$150')).toBeInTheDocument()
  })

  it('should_ToggleTooltip_When_PointTapped', async () => {
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)

    await user.click(screen.getByTestId('point-2026-07-09'))
    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')
    expect(within(screen.getByTestId('tooltip')).getByText('$150')).toBeInTheDocument()

    await user.click(screen.getByTestId('point-2026-07-09'))
    expect(screen.queryByTestId('tooltip')).not.toBeInTheDocument()
  })

  it('should_ToggleWithOneClick_When_MouseLeavesPinnedPointBeforeRetapping', async () => {
    // Regresión: el ref viejo desincronizaba el "fijado" del estado visible al
    // salir del punto con el mouse, y el próximo click sobre el mismo punto
    // quedaba en no-op (recién el tercer click reabría). Con estado explícito,
    // el pin sobrevive al mouseLeave y el click lo togglea en un solo paso.
    const user = userEvent.setup()
    render(<SlrdLineChart points={points} />)
    const target = screen.getByTestId('point-2026-07-09')

    await user.click(target)
    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')

    fireEvent.mouseLeave(target)
    // El tooltip fijado no depende del hover: sigue visible al salir el mouse.
    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')

    await user.click(target)
    expect(screen.queryByTestId('tooltip-date')).not.toBeInTheDocument()

    await user.click(target)
    expect(screen.getByTestId('tooltip-date')).toHaveTextContent('2026-07-09')
  })

  // Los puntos tienen SLRD 100 y 150 → dominio redondeado 100..150. El $250 del
  // contable ya no está: dejó de definir el eje.
  it('should_ShowSlrdDomainTicksAndShortDates_When_GivenTwoOrMorePoints', () => {
    render(<SlrdLineChart points={points} />)

    expect(screen.getByTestId('chart-first-date')).toHaveTextContent('8 jul')
    expect(screen.getByTestId('chart-last-date')).toHaveTextContent('9 jul')
    expect(screen.queryByText('$250')).toBeNull()
  })
})
