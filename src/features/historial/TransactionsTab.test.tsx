import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TransactionsTab } from './TransactionsTab'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import type { MonthTx } from '../../data/types'

vi.mock('../../data/useMonthTransactions')

function tx(partial: Partial<MonthTx>): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: '2026-07-12', amount: 12000,
    type: 'gasto', channel: null, categoryName: 'Comida',
    accountName: 'BICE', accountType: 'credit', ...partial,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('TransactionsTab', () => {
  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: true, isError: false } as any)

    const { container } = render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument()
  })

  it('should_ShowRetry_When_Error', async () => {
    const refetch = vi.fn()
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: true, refetch } as any)
    const user = userEvent.setup()

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: /reintentar/i }))

    expect(refetch).toHaveBeenCalled()
  })

  it('should_ShowIngresoWithPlusAndAccentColor_When_TypeIsIngreso', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ type: 'ingreso', amount: 900000, categoryName: 'Sueldo', accountName: 'Santander', accountType: 'debit' })],
    } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    const amount = screen.getByText('+$900.000')
    expect(amount).toBeInTheDocument()
    expect(amount.className).toContain('text-accent-bright')
  })

  it('should_ShowGastoWithMinusAndNoAccent_When_TypeIsGasto', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ type: 'gasto', amount: 12000, categoryName: 'Comida' })],
    } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    const amount = screen.getByText('−$12.000')
    expect(amount).toBeInTheDocument()
    expect(amount.className).not.toContain('text-accent-bright')
  })

  // Nota: los nombres de categoría aparecen dos veces (fila de la lista y <option>
  // del filtro), así que las aserciones se acotan a la lista con data-testid.
  it('should_ListAllTx_When_NoFilterSelected', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ categoryName: 'Comida' }), tx({ categoryName: 'Ocio', accountName: 'Santander', accountType: 'debit' })],
    } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getAllByTestId('tx-row')).toHaveLength(2)
  })

  it('should_FilterByCategory_When_CategorySelected', async () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ categoryName: 'Comida' }), tx({ categoryName: 'Ocio' })],
    } as any)
    const user = userEvent.setup()

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Ocio')

    const rows = screen.getAllByTestId('tx-row')
    expect(rows).toHaveLength(1)
    expect(within(rows[0]).getByText('Ocio')).toBeInTheDocument()
  })

  it('should_ResetFilters_When_MonthChanges', async () => {
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ categoryName: 'Comida' }), tx({ categoryName: 'Ocio' })],
    } as any)
    const user = userEvent.setup()

    const { rerender } = render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)
    await user.selectOptions(screen.getByLabelText('Categoría'), 'Ocio')
    expect(screen.getAllByTestId('tx-row')).toHaveLength(1)

    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [tx({ categoryName: 'Comida' }), tx({ categoryName: 'Comida' })],
    } as any)
    rerender(<TransactionsTab month="2026-06" onMonthChange={vi.fn()} />)

    await waitFor(() => expect(screen.getAllByTestId('tx-row')).toHaveLength(2))
    expect(screen.getByLabelText('Categoría')).toHaveValue('todas')
  })

  it('should_ShowCalmEmpty_When_NoTxMatch', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)

    render(<TransactionsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText(/sin movimientos/i)).toBeInTheDocument()
  })
})
