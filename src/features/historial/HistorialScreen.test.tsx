import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HistorialScreen } from './HistorialScreen'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import { useMonthTransactions } from '../../data/useMonthTransactions'

vi.mock('../../data/useSlrdHistory')
vi.mock('../../data/useMonthTransactions')

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(useSlrdHistory).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
})

describe('HistorialScreen', () => {
  it('should_ShowSlrdTabByDefault', () => {
    render(<HistorialScreen />)

    // El empty del SLRD (default) menciona el historial que se arma solo.
    expect(screen.getByText(/el historial se arma solo/i)).toBeInTheDocument()
  })

  it('should_SwitchToGastoTab_When_TabClicked', async () => {
    const user = userEvent.setup()
    render(<HistorialScreen />)

    await user.click(screen.getByRole('button', { name: 'Gasto' }))

    expect(screen.getByText(/sin gastos este mes/i)).toBeInTheDocument()
  })

  it('should_SwitchToMovimientosTab_When_TabClicked', async () => {
    const user = userEvent.setup()
    render(<HistorialScreen />)

    await user.click(screen.getByRole('button', { name: 'Movimientos' }))

    expect(screen.getByText(/sin movimientos/i)).toBeInTheDocument()
  })
})
