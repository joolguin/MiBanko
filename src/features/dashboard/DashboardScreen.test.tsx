import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DashboardScreen } from './DashboardScreen'

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }))
vi.mock('../../data/useSlrd')
vi.mock('../../data/useLatestSnapshotAge')
vi.mock('../../data/useUserSettings')
import { useSlrd } from '../../data/useSlrd'
import { useLatestSnapshotAge } from '../../data/useLatestSnapshotAge'
import { useUserSettings } from '../../data/useUserSettings'

const LOADED = {
  isLoading: false, isError: false,
  data: {
    slrdInmediato: 487320, slrdTotal: 2301540, saldoContable: 2514900,
    saldoDebito: 786220, saldoInversion: 1814220,
    deudaFacturada: 298900, deudaNoFacturada: 156400,
  },
}

beforeEach(() => {
  vi.mocked(useLatestSnapshotAge).mockReturnValue({ data: 2 } as any)
  vi.mocked(useUserSettings).mockReturnValue({ data: { freshLimitDays: 4 } } as any)
})

describe('DashboardScreen', () => {
  it('should_ShowSkeletons_When_Loading', () => {
    vi.mocked(useSlrd).mockReturnValue({ isLoading: true } as any)
    render(<DashboardScreen />)
    expect(screen.getByTestId('slrd-skeleton')).toBeInTheDocument()
  })

  it('should_ShowError_When_Failed', () => {
    vi.mocked(useSlrd).mockReturnValue({ isError: true, isLoading: false } as any)
    render(<DashboardScreen />)
    expect(screen.getByText(/no pudimos cargar/i)).toBeInTheDocument()
  })

  it('should_RenderHero_When_Loaded', () => {
    vi.mocked(useSlrd).mockReturnValue(LOADED as any)
    render(<DashboardScreen />)
    expect(screen.getByText('$2.514.900')).toBeInTheDocument()   // saldo contable tachado
    expect(screen.getByText(/con fintual/i)).toBeInTheDocument()
    expect(screen.getByText(/hace 2 días/i)).toBeInTheDocument()
  })

  it('should_ShowStaleBannerAndMark_When_SnapshotOld', () => {
    vi.mocked(useLatestSnapshotAge).mockReturnValue({ data: 10 } as any)
    vi.mocked(useSlrd).mockReturnValue(LOADED as any)
    render(<DashboardScreen />)
    expect(screen.getByText(/puede estar desactualizado/i)).toBeInTheDocument()
    expect(screen.getByText(/estimado · snapshot viejo/i)).toBeInTheDocument()
    expect(screen.getByText(/snapshot hace 10 días/i)).toBeInTheDocument()
  })
  it('should_NotShowBanner_When_Fresh', () => {
    vi.mocked(useSlrd).mockReturnValue(LOADED as any)   // age 2, umbral 4 -> fresco
    render(<DashboardScreen />)
    expect(screen.queryByText(/puede estar desactualizado/i)).not.toBeInTheDocument()
  })
})
