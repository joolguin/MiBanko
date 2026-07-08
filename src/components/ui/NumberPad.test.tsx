import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NumberPad } from './NumberPad'

describe('NumberPad', () => {
  it('should_AppendDigit_When_Tapped', async () => {
    const onChange = vi.fn()
    render(<NumberPad value={45} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '0' }))
    expect(onChange).toHaveBeenCalledWith(450)
  })
  it('should_Backspace_When_DeleteTapped', async () => {
    const onChange = vi.fn()
    render(<NumberPad value={45} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /borrar/i }))
    expect(onChange).toHaveBeenCalledWith(4)
  })
})
