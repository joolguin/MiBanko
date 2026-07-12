import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BudgetSheet } from './BudgetSheet'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'

vi.mock('../../data/useBudgets')

describe('BudgetSheet', () => {
  beforeEach(() => {
    vi.mocked(useSaveBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
    vi.mocked(useDeleteBudget).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
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
})
