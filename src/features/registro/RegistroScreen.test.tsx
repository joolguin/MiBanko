import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { RegistroScreen } from './RegistroScreen'

vi.mock('../../data/useAccounts')
vi.mock('../../data/useCategories')
vi.mock('../../data/useRegisterTransaction')
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useRegisterTransaction } from '../../data/useRegisterTransaction'

const mutate = vi.fn()
beforeEach(() => {
  vi.mocked(useAccounts).mockReturnValue({ data: [
    { id: 'bice', name: 'BICE Visa Gold', type: 'credit', bank: 'BICE' },
    { id: 'sant', name: 'Santander Vista', type: 'debit', bank: 'Santander' },
  ] } as any)
  vi.mocked(useCategories).mockReturnValue({ data: [{ id: 'c1', name: 'Comida' }] } as any)
  vi.mocked(useRegisterTransaction).mockReturnValue({ mutate, isPending: false, isError: false } as any)
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
})
