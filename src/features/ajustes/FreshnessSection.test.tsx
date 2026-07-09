import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FreshnessSection } from './FreshnessSection'

vi.mock('../../data/useUserSettings')
import { useUserSettings, useSaveUserSettings } from '../../data/useUserSettings'

const save = vi.fn()
beforeEach(() => {
  save.mockReset()
  vi.mocked(useUserSettings).mockReturnValue({ data: { freshLimitDays: 4 } } as any)
  vi.mocked(useSaveUserSettings).mockReturnValue({ mutate: save, isPending: false, isError: false } as any)
})

describe('FreshnessSection', () => {
  it('should_SaveThreshold_When_GuardarClicked', async () => {
    const user = userEvent.setup()
    render(<FreshnessSection />)
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '10')
    await user.click(screen.getByRole('button', { name: /guardar umbral/i }))
    expect(save).toHaveBeenCalledWith({ freshLimitDays: 10 })
  })
  it('should_ClampThreshold_When_OutOfRange', async () => {
    const user = userEvent.setup()
    render(<FreshnessSection />)
    const input = screen.getByRole('textbox')
    await user.clear(input)
    await user.type(input, '100')
    await user.click(screen.getByRole('button', { name: /guardar umbral/i }))
    expect(save).toHaveBeenCalledWith({ freshLimitDays: 60 })
  })
})
