import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CicloScreen } from './CicloScreen'

// Aislamos el hijo UnpaidCyclesSection para testear CicloScreen sola. Esto mantiene el test
// estable cuando Task 6 reemplaza el stub por la implementación real (que llama otros hooks).
vi.mock('./UnpaidCyclesSection', () => ({ UnpaidCyclesSection: () => null }))
vi.mock('../../data/useCurrentCycle')
vi.mock('../../data/useBiceConfig')
import { useCurrentCycleTransactions } from '../../data/useCurrentCycle'
import { useBiceConfig } from '../../data/useBiceConfig'

beforeEach(() => {
  vi.mocked(useCurrentCycleTransactions).mockReturnValue({
    data: { items: [
      { id: 't1', amount: 25000, description: 'Almuerzo', transactionDate: '2026-07-01', categoryName: 'Comida' },
      { id: 't2', amount: 15000, description: 'Uber', transactionDate: '2026-07-02', categoryName: 'Transporte' },
    ], total: 40000 }, isLoading: false, isError: false,
  } as any)
})

describe('CicloScreen', () => {
  it('should_ShowPartialSum_When_HasCurrentCycleTxs', () => {
    vi.mocked(useBiceConfig).mockReturnValue({ data: { closingDay: 25, dueDay: 15 }, isLoading: false } as any)
    render(<MemoryRouter><CicloScreen /></MemoryRouter>)
    expect(screen.getByText('$40.000')).toBeInTheDocument()
    expect(screen.getByText('Almuerzo')).toBeInTheDocument()
  })
  it('should_DisableCloseAndPromptConfig_When_NoBiceConfig', () => {
    vi.mocked(useBiceConfig).mockReturnValue({ data: null, isLoading: false } as any)
    render(<MemoryRouter><CicloScreen /></MemoryRouter>)
    expect(screen.getByText(/configurá las fechas/i)).toBeInTheDocument()
  })
})
