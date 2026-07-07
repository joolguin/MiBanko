import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MoneyText } from './MoneyText'

describe('MoneyText', () => {
  it('should_RenderFormattedCLP_When_Plain', () => {
    render(<MoneyText value={487320} />)
    expect(screen.getByText('$487.320')).toBeInTheDocument()
  })
  it('should_RenderSigned_When_SignedProp', () => {
    render(<MoneyText value={-298900} signed />)
    expect(screen.getByText('−$298.900')).toBeInTheDocument()
  })
})
