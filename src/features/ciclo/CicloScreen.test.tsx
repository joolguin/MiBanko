import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CicloScreen } from './CicloScreen'

// Aislamos el hijo UnpaidCyclesSection para testear CicloScreen sola. Esto mantiene el test
// estable cuando Task 6 reemplaza el stub por la implementación real (que llama otros hooks).
vi.mock('./UnpaidCyclesSection', () => ({ UnpaidCyclesSection: () => null }))
vi.mock('../../data/useCurrentCycle')
vi.mock('../../data/useBiceConfig')
vi.mock('../../data/useCloseCycle')
import { useCurrentCycleTransactions } from '../../data/useCurrentCycle'
import { useBiceConfig, useSaveBiceConfig } from '../../data/useBiceConfig'
import { useCloseCycle } from '../../data/useCloseCycle'

beforeEach(() => {
  vi.mocked(useCurrentCycleTransactions).mockReturnValue({
    data: { items: [
      { id: 't1', amount: 25000, description: 'Almuerzo', transactionDate: '2026-07-01', categoryName: 'Comida' },
      { id: 't2', amount: 15000, description: 'Uber', transactionDate: '2026-07-02', categoryName: 'Transporte' },
    ], total: 40000 }, isLoading: false, isError: false,
  } as any)
  vi.mocked(useSaveBiceConfig).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
  vi.mocked(useCloseCycle).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
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
    expect(screen.queryByText(/día \d+ de \d+/)).not.toBeInTheDocument()
  })

  it('should_ShowCycleProgress_When_HasConfig', () => {
    // Hoy fijo 16-jul con corte el 25: ciclo abierto 26-jun..25-jul -> día 21 de 30.
    vi.useFakeTimers({ now: new Date('2026-07-16T15:00:00Z'), toFake: ['Date'] })
    vi.mocked(useBiceConfig).mockReturnValue({ data: { closingDay: 25, dueDay: 15 }, isLoading: false } as any)
    try {
      render(<MemoryRouter><CicloScreen /></MemoryRouter>)
      expect(screen.getByText('día 21 de 30')).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })
})
