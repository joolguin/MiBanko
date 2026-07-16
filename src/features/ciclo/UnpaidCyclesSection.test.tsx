import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { UnpaidCyclesSection } from './UnpaidCyclesSection'

vi.mock('../../data/useUnpaidCycles')
vi.mock('../../data/useAccounts')
vi.mock('../../data/useSaveSnapshot')
import { useUnpaidCycles, usePaidCycles } from '../../data/useUnpaidCycles'
import { useAccounts } from '../../data/useAccounts'
import { useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'

beforeEach(() => {
  vi.mocked(useUnpaidCycles).mockReturnValue({ data: [
    { id: 'c1', cycleStart: '2026-06-01', cycleEnd: '2026-06-25', dueDate: '2026-07-15', billedAmount: 300000, isPaid: false },
  ], isLoading: false } as any)
  vi.mocked(usePaidCycles).mockReturnValue({ data: [], isLoading: false } as any)
  vi.mocked(useAccounts).mockReturnValue({ data: [{ id: 'sant', name: 'Santander Vista', type: 'debit', bank: 'Santander' }] } as any)
  vi.mocked(useLatestSnapshotsByAccount).mockReturnValue({ data: { sant: { accountId: 'sant', balance: 500000, snapshotDate: '2026-07-07' } } } as any)
})

describe('UnpaidCyclesSection', () => {
  it('should_ListUnpaidCycleWithAmountAndDue_When_Present', () => {
    // PayCycleSheet (rendered unconditionally inside UnpaidCyclesSection) calls usePayCycle,
    // which needs a real QueryClient in scope even when the sheet is closed.
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UnpaidCyclesSection />
      </QueryClientProvider>,
    )
    expect(screen.getByText('$300.000')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /marcar pagada/i })).toBeInTheDocument()
  })

  it('should_ShowShortDueDate_When_Present', () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <UnpaidCyclesSection />
      </QueryClientProvider>,
    )
    expect(screen.getByText('vence 15 jul')).toBeInTheDocument()
    expect(screen.queryByText(/2026-07-15/)).not.toBeInTheDocument()
  })
})
