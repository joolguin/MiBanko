import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CategoriesSection } from './CategoriesSection'

vi.mock('../../data/useCategories')
import { useCategories, useSaveCategory, useDeleteCategory } from '../../data/useCategories'

const del = vi.fn()
beforeEach(() => {
  del.mockReset()
  vi.mocked(useCategories).mockReturnValue({ data: [
    { id: 'c1', name: 'Comida' },
  ], isLoading: false, isError: false } as any)
  vi.mocked(useSaveCategory).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false, reset: vi.fn() } as any)
  vi.mocked(useDeleteCategory).mockReturnValue({ mutate: del, isError: false } as any)
})

describe('CategoriesSection', () => {
  it('should_ListCategory_When_Present', () => {
    render(<CategoriesSection />)
    expect(screen.getByText('Comida')).toBeInTheDocument()
  })
  it('should_ConfirmBeforeDelete_When_TrashClicked', async () => {
    const user = userEvent.setup()
    render(<CategoriesSection />)
    await user.click(screen.getByRole('button', { name: /borrar comida/i }))
    expect(del).not.toHaveBeenCalled()               // primero pide confirmación
    await user.click(screen.getByRole('button', { name: /^sí$/i }))
    expect(del).toHaveBeenCalledWith('c1')
  })
  it('should_ShowEmpty_When_NoCategories', () => {
    vi.mocked(useCategories).mockReturnValue({ data: [], isLoading: false, isError: false } as any)
    render(<CategoriesSection />)
    expect(screen.getByText(/no tenés categorías/i)).toBeInTheDocument()
  })
  it('should_ShowDuplicateError_When_SaveFails', async () => {
    const user = userEvent.setup()
    vi.mocked(useSaveCategory).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: true, reset: vi.fn() } as any)
    render(<CategoriesSection />)
    await user.click(screen.getByRole('button', { name: /agregar categoría/i }))
    expect(screen.getByText(/ya existe una categoría con ese nombre/i)).toBeInTheDocument()
  })
})
