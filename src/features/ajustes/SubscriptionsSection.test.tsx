import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SubscriptionsSection } from './SubscriptionsSection'

vi.mock('../../data/useSubscriptions')
vi.mock('../../data/useCategories')
import {
  useSubscriptions, useToggleSubscription, useDeleteSubscription, useSaveSubscription,
} from '../../data/useSubscriptions'
import { useCategories } from '../../data/useCategories'

const del = vi.fn()
const toggle = vi.fn()
beforeEach(() => {
  del.mockReset(); toggle.mockReset()
  vi.mocked(useSubscriptions).mockReturnValue({ data: [
    { id: 's1', name: 'Spotify', amount: 5900, chargeDayOfMonth: 5, categoryId: null, channel: 'wallet_pixel', isActive: true },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useToggleSubscription).mockReturnValue({ mutate: toggle } as any)
  vi.mocked(useDeleteSubscription).mockReturnValue({ mutate: del } as any)
  vi.mocked(useSaveSubscription).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as any)
  vi.mocked(useCategories).mockReturnValue({ data: [] } as any)
})

describe('SubscriptionsSection', () => {
  it('should_ListSubscription_When_Present', () => {
    render(<SubscriptionsSection />)
    expect(screen.getByText('Spotify')).toBeInTheDocument()
    expect(screen.getByText('$5.900')).toBeInTheDocument()
    expect(screen.getByText(/día 5/i)).toBeInTheDocument()
  })
  it('should_CallDelete_When_BorrarClicked', async () => {
    const user = userEvent.setup()
    render(<SubscriptionsSection />)
    await user.click(screen.getByRole('button', { name: /borrar spotify/i }))
    expect(del).toHaveBeenCalledWith('s1')
  })
  it('should_ShowEmpty_When_NoSubscriptions', () => {
    vi.mocked(useSubscriptions).mockReturnValue({ data: [], isLoading: false, isError: false } as any)
    render(<SubscriptionsSection />)
    expect(screen.getByText(/no tenés suscripciones/i)).toBeInTheDocument()
  })
  it('should_ShowInlineError_When_DeleteFails', () => {
    vi.mocked(useDeleteSubscription).mockReturnValue({ mutate: del, isError: true } as any)
    render(<SubscriptionsSection />)
    expect(screen.getByText(/no se pudo actualizar/i)).toBeInTheDocument()
  })
})
