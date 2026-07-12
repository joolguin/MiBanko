import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegistroScreen } from './RegistroScreen'

vi.mock('../../data/useAccounts')
vi.mock('../../data/useCategories')
vi.mock('../../data/useRegisterTransaction')
vi.mock('../../data/useBudgets')
vi.mock('../../data/useMonthTransactions')
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useRegisterTransaction } from '../../data/useRegisterTransaction'
import { useBudgets } from '../../data/useBudgets'
import { useMonthTransactions } from '../../data/useMonthTransactions'

const mutate = vi.fn()
beforeEach(() => {
  vi.mocked(useAccounts).mockReturnValue({ data: [
    { id: 'bice', name: 'BICE Visa Gold', type: 'credit', bank: 'BICE' },
    { id: 'sant', name: 'Santander Vista', type: 'debit', bank: 'Santander' },
  ] } as any)
  vi.mocked(useCategories).mockReturnValue({ data: [{ id: 'c1', name: 'Comida' }] } as any)
  vi.mocked(useRegisterTransaction).mockReturnValue({ mutate, isPending: false, isError: false } as any)
  vi.mocked(useBudgets).mockReturnValue({ data: [] } as any)
  vi.mocked(useMonthTransactions).mockReturnValue({ data: [] } as any)
  mutate.mockReset()
})

function renderScreen() {
  return render(<MemoryRouter><RegistroScreen /></MemoryRouter>)
}

describe('RegistroScreen', () => {
  it('should_DefaultToBiceGastoWallet_When_Opened', () => {
    renderScreen()
    expect(screen.getByText('BICE Visa Gold')).toBeInTheDocument()
    expect(screen.getByText(/gasto/i)).toBeInTheDocument()
  })

  it('should_SubmitWithDefaults_When_AmountEnteredAndSaved', async () => {
    renderScreen()
    await userEvent.click(screen.getByRole('button', { name: '5' }))
    await userEvent.click(screen.getByRole('button', { name: '0' }))
    await userEvent.click(screen.getByRole('button', { name: '0' }))
    await userEvent.click(screen.getByRole('button', { name: '0' }))
    await userEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'bice', accountType: 'credit', type: 'gasto',
        channel: 'wallet_pixel', amount: 5000, billingCycleId: null,
      }),
      expect.anything(),
    )
  })

  it('should_DisableSave_When_AmountZero', () => {
    renderScreen()
    expect(screen.getByRole('button', { name: /guardar/i })).toBeDisabled()
  })

  async function selectComidaAndType90k() {
    await userEvent.click(screen.getByText('Categoría'))
    await userEvent.click(screen.getByRole('button', { name: 'Comida' }))
    for (const d of ['9', '0', '0', '0', '0']) {
      await userEvent.click(screen.getByRole('button', { name: d }))
    }
  }

  // El <p> del aviso mezcla texto y <span> de MoneyText, así que lo ubicamos por
  // el <p> cuyo textContent contiene "quedás en".
  const hintParagraph = (_content: string, el: Element | null) =>
    el?.tagName.toLowerCase() === 'p' && (el.textContent ?? '').includes('quedás en')

  it('should_ShowBudgetHint_When_ExpenseCrossesThreshold', async () => {
    vi.mocked(useBudgets).mockReturnValue({ data: [{ id: 'b1', categoryId: 'c1', amount: 100000 }] } as any)
    renderScreen()
    await selectComidaAndType90k() // 90.000 de 100.000 = 90% => cruza a warn

    const hint = screen.getByText(hintParagraph)
    expect(hint.textContent).toMatch(/Comida/)
    expect(hint.textContent).toMatch(/90%/)
  })

  it('should_NotShowBudgetHint_When_CategoryHasNoBudget', async () => {
    // useBudgets es [] por defecto
    renderScreen()
    await selectComidaAndType90k()

    expect(screen.queryByText(hintParagraph)).toBeNull()
  })
})
