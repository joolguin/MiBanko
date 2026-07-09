import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistorialScreen } from './HistorialScreen'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import type { SlrdHistoryPoint } from '../../data/types'

vi.mock('../../data/useSlrdHistory')

function point(date: string, slrd: number): SlrdHistoryPoint {
  return {
    snapshotDate: date,
    slrdInmediato: slrd, slrdTotal: slrd, saldoContable: slrd + 100,
    saldoDebito: 0, saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('HistorialScreen', () => {
  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({ isLoading: true, isError: false } as any)

    const { container } = render(<HistorialScreen />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should_ShowRetry_When_Error', async () => {
    const refetch = vi.fn()
    vi.mocked(useSlrdHistory).mockReturnValue({ isLoading: false, isError: true, refetch } as any)
    const user = userEvent.setup()

    render(<HistorialScreen />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(refetch).toHaveBeenCalled()
  })

  it('should_ShowCalmEmpty_When_FewerThanTwoPoints', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({
      isLoading: false, isError: false, data: [],
    } as any)

    render(<HistorialScreen />)

    expect(screen.getByText(/el historial se arma solo/i)).toBeInTheDocument()
    expect(screen.queryByText(/slrd de hoy/i)).not.toBeInTheDocument()
    expect(screen.queryByText('$100')).not.toBeInTheDocument()
  })

  it('should_ShowCalmEmptyWithTodayValue_When_OnlyOnePointExists', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({
      isLoading: false, isError: false, data: [point('2026-07-09', 100)],
    } as any)

    render(<HistorialScreen />)

    expect(screen.getByText(/el historial se arma solo/i)).toBeInTheDocument()
    expect(screen.getByText(/slrd de hoy/i)).toBeInTheDocument()
    expect(screen.getByText('$100')).toBeInTheDocument()
  })

  it('should_RenderChart_When_EnoughPoints', () => {
    vi.mocked(useSlrdHistory).mockReturnValue({
      isLoading: false, isError: false,
      data: [point('2026-07-08', 100), point('2026-07-09', 150)],
    } as any)

    const { container } = render(<HistorialScreen />)

    expect(container.querySelectorAll('path[data-series]').length).toBeGreaterThan(0)
  })
})
