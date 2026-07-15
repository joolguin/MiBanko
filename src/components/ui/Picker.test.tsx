import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Picker } from './Picker'

describe('Picker', () => {
  it('should_CallOnClick_When_Pressed', async () => {
    const onClick = vi.fn()
    render(<Picker label="BICE Visa Gold" onClick={onClick} />)

    await userEvent.click(screen.getByRole('button', { name: 'BICE Visa Gold' }))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('should_ShowCurrentValueAsAccessibleName', () => {
    render(<Picker label="Comida" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Comida' })).toBeInTheDocument()
  })

  it('should_MarkAsMissing_When_FaltaIsTrue', () => {
    render(<Picker label="Categoría" onClick={vi.fn()} falta />)

    expect(screen.getByRole('button', { name: 'Categoría' })).toHaveClass('border-dashed')
  })

  it('should_NotMarkAsMissing_When_FaltaIsOmitted', () => {
    render(<Picker label="Comida" onClick={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Comida' })).not.toHaveClass('border-dashed')
  })
})
