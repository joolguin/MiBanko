import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BudgetSheet } from './BudgetSheet'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'
import { useCategoryAverages } from '../../data/useCategoryAverages'
import type { MonthTx } from '../../data/types'

vi.mock('../../data/useBudgets')
vi.mock('../../data/useCategoryAverages')

const MONTH_KEYS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

function gasto(categoryId: string, amount: number, month: string): MonthTx {
  return {
    id: Math.random().toString(), transactionDate: `${month}-15`, amount,
    type: 'gasto', categoryId, channel: null, categoryName: null,
    accountName: 'BICE', accountType: 'credit',
  }
}

// c1: 90k en 01-03, 30k en 04-06 -> ventana 3 = 30.000, ventana 6 = 60.000
const ROWS: MonthTx[] = [
  gasto('c1', 90000, '2026-01'), gasto('c1', 90000, '2026-02'), gasto('c1', 90000, '2026-03'),
  gasto('c1', 30000, '2026-04'), gasto('c1', 30000, '2026-05'), gasto('c1', 30000, '2026-06'),
]

describe('BudgetSheet', () => {
  beforeEach(() => {
    vi.mocked(useSaveBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
    vi.mocked(useDeleteBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
    vi.mocked(useCategoryAverages).mockReturnValue({
      rows: ROWS, monthKeys: MONTH_KEYS, isLoading: false, isError: false,
    })
  })

  it('should_ShowNewTitle_When_InitialAmountNull', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Supermercado" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.getByText(/Presupuesto de Supermercado/i)).toBeInTheDocument()
    expect(screen.queryByText(/Borrar presupuesto/i)).not.toBeInTheDocument()
  })

  it('should_ShowDeleteButton_When_EditingExistingBudget', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Supermercado" initialAmount={150000} onClose={vi.fn()} />)

    expect(screen.getByText(/Borrar presupuesto/i)).toBeInTheDocument()
  })

  it('should_ShowAverageSuggestion_When_HistoryExists', () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.getByText(/Promedio/i)).toBeInTheDocument()
    expect(screen.getByText('$30.000')).toBeInTheDocument()
  })

  it('should_FillAmount_When_SuggestionTapped', async () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)
    expect(screen.getByText('$0')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Promedio/i }))

    expect(screen.queryByText('$0')).not.toBeInTheDocument()
    // visor + sugerencia muestran el mismo monto
    expect(screen.getAllByText('$30.000').length).toBe(2)
  })

  it('should_Recompute_When_WindowSwitchedTo6', async () => {
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: /6 meses/i }))

    expect(screen.getByText('$60.000')).toBeInTheDocument()
  })

  it('should_HideSuggestion_When_NoHistory', () => {
    vi.mocked(useCategoryAverages).mockReturnValue({
      rows: [], monthKeys: MONTH_KEYS, isLoading: false, isError: false,
    })
    render(<BudgetSheet open categoryId="c1" categoryName="Comida" initialAmount={null} onClose={vi.fn()} />)

    expect(screen.queryByText(/Promedio/i)).not.toBeInTheDocument()
  })
})
