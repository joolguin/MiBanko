import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetsTab } from './BudgetsTab'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { useBudgets, useSaveBudget, useDeleteBudget } from '../../data/useBudgets'
import { useCategories } from '../../data/useCategories'

vi.mock('../../data/useMonthTransactions')
vi.mock('../../data/useBudgets')
vi.mock('../../data/useCategories')

function setupDefaults() {
  vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  vi.mocked(useBudgets).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  vi.mocked(useCategories).mockReturnValue({ isLoading: false, isError: false, data: [] } as any)
  // BudgetSheet (siempre montado por BudgetsTab) llama estos hooks incondicionalmente.
  vi.mocked(useSaveBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
  vi.mocked(useDeleteBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
}

describe('BudgetsTab', () => {
  beforeEach(() => setupDefaults())

  it('should_ShowSkeleton_When_Loading', () => {
    vi.mocked(useMonthTransactions).mockReturnValue({ isLoading: true, isError: false } as any)
    const { container } = render(<BudgetsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(container.querySelector('.animate-pulse, [data-skeleton]')).toBeTruthy()
  })

  it('should_ShowEmptyHint_When_NoBudgets', () => {
    render(<BudgetsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText(/Sin presupuestos/i)).toBeInTheDocument()
  })

  it('should_RenderBudgetRowWithSpentAndPct_When_HasBudget', () => {
    vi.mocked(useBudgets).mockReturnValue({
      isLoading: false, isError: false, data: [{ id: 'b1', categoryId: 'c1', amount: 100000 }],
    } as any)
    vi.mocked(useCategories).mockReturnValue({
      isLoading: false, isError: false, data: [{ id: 'c1', name: 'Supermercado' }],
    } as any)
    vi.mocked(useMonthTransactions).mockReturnValue({
      isLoading: false, isError: false,
      data: [{
        id: 't1', transactionDate: '2026-07-05', amount: 80000, type: 'gasto',
        channel: null, categoryId: 'c1', categoryName: 'Supermercado',
        accountName: 'BICE', accountType: 'credit',
      }],
    } as any)

    render(<BudgetsTab month="2026-07" onMonthChange={vi.fn()} />)

    expect(screen.getByText('Supermercado')).toBeInTheDocument()
    expect(screen.getByText(/80\s*%/)).toBeInTheDocument()
  })
})
