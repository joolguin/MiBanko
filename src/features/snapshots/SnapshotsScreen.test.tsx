import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SnapshotsScreen } from './SnapshotsScreen'

vi.mock('../../data/useAccounts')
vi.mock('../../data/useSaveSnapshot')
import { useAccounts } from '../../data/useAccounts'
import { useSaveSnapshot, useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'

const mutate = vi.fn()
beforeEach(() => {
  vi.mocked(useAccounts).mockReturnValue({ data: [
    { id: 'sant', name: 'Santander Vista', type: 'debit', bank: 'Santander' },
    { id: 'fin', name: 'Fintual', type: 'investment', bank: 'Fintual' },
  ] } as any)
  vi.mocked(useLatestSnapshotsByAccount).mockReturnValue({ data: {
    sant: { accountId: 'sant', balance: 500000, snapshotDate: '2026-07-07' },
    fin: { accountId: 'fin', balance: 2000000, snapshotDate: '2026-07-07' },
  } } as any)
  vi.mocked(useSaveSnapshot).mockReturnValue({ mutate, isPending: false, isError: false } as any)
  mutate.mockReset()
})

describe('SnapshotsScreen', () => {
  it('should_ShowBothAccounts_When_Rendered', () => {
    render(<MemoryRouter><SnapshotsScreen /></MemoryRouter>)
    expect(screen.getByText('Santander Vista')).toBeInTheDocument()
    expect(screen.getByText('Fintual')).toBeInTheDocument()
  })
  it('should_SaveOnlyChangedAccounts_When_OneEdited', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><SnapshotsScreen /></MemoryRouter>)
    await user.click(screen.getByText('Santander Vista')) // selecciona el campo
    await user.click(screen.getByRole('button', { name: '9' }))
    await user.click(screen.getByRole('button', { name: /guardar/i }))
    expect(mutate).toHaveBeenCalledWith(
      [expect.objectContaining({ accountId: 'sant' })],
      expect.anything(),
    )
  })
})
