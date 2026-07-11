import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PreviewTable, type PreviewRow } from './PreviewTable'
import type { Category } from '../../data/types'

const categories: Category[] = [
  { id: 'cat-comida', name: 'Comida' },
  { id: 'cat-transporte', name: 'Transporte' },
]

function rows(): PreviewRow[] {
  return [
    { date: '2026-07-10', description: 'Google Play', amount: 5500, kind: 'gasto', categoryId: null, selected: true, isDuplicate: false },
    { date: '2026-07-07', description: 'Rosario Norte', amount: 3250, kind: 'gasto', categoryId: 'cat-transporte', selected: false, isDuplicate: true },
  ]
}

describe('PreviewTable', () => {
  it('should_RenderRowsAndDuplicateBadge_When_Given', () => {
    render(<PreviewTable rows={rows()} categories={categories} onChange={vi.fn()} onToggleAll={vi.fn()} onBulkCategory={vi.fn()} />)

    expect(screen.getByText('Google Play')).toBeInTheDocument()
    expect(screen.getByText(/posible duplicado/i)).toBeInTheDocument()
  })

  it('should_CallOnChange_When_TogglingRow', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<PreviewTable rows={rows()} categories={categories} onChange={onChange} onToggleAll={vi.fn()} onBulkCategory={vi.fn()} />)

    await user.click(screen.getAllByRole('checkbox')[1]) // primera fila de datos

    expect(onChange).toHaveBeenCalledWith(0, { selected: false })
  })
})
