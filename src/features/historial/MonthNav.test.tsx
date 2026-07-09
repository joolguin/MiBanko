import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthNav } from './MonthNav'

describe('MonthNav', () => {
  it('should_ShowMonthLabel', () => {
    render(<MonthNav month="2026-07" onChange={vi.fn()} />)

    expect(screen.getByText('Julio 2026')).toBeInTheDocument()
  })

  it('should_EmitPrevMonth_When_PrevClicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MonthNav month="2026-07" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /mes anterior/i }))

    expect(onChange).toHaveBeenCalledWith('2026-06')
  })

  it('should_EmitNextMonth_When_NextClicked', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<MonthNav month="2026-07" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: /mes siguiente/i }))

    expect(onChange).toHaveBeenCalledWith('2026-08')
  })
})
