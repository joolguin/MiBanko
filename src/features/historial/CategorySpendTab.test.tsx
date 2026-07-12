import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategorySpendTab } from './CategorySpendTab'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import type { MonthTx } from '../../data/types'

vi.mock('../../data/useMonthTransactions')

function gasto(category: string, amount: number): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-10', amount,
    type: 'gasto', categoryId: null, channel: null, categoryName: category,
    accountName: 'BICE', accountType: 'credit',
  }
}

beforeEach(() => vi.clearAllMocks())

describe('CategorySpendTab', () => {
  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: true, isError: false } as any)

    const { container } = render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should_ShowRetry_When_Error', async () => {
    const refetch = vi.fn()
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: true, refetch } as any)
    const user = userEvent.setup()

    render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(refetch).toHaveBeenCalled()
  })

  it('should_ShowCalmEmpty_When_NoGastos', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)

    render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText(/sin gastos este mes/i)).toBeInTheDocument()
  })

  it('should_RenderDonutAndLegend_When_HasGastos', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false, data: [gasto('Comida', 80), gasto('Ocio', 20)],
    } as any)

    const { container } = render(<CategorySpendTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelectorAll('circle[data-arc]')).toHaveLength(2)
    expect(screen.getByText('Comida')).toBeInTheDocument()
    expect(screen.getByText('80%')).toBeInTheDocument()
  })
})
