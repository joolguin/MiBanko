import { describe, it, expect } from 'vitest'
import { slrdDelta } from './slrdDelta'

const base = { accountType: 'credit', billingCycleId: null, amount: 10000 } as const

describe('slrdDelta', () => {
  it('should_SubtractAmount_When_GastoCreditSinCiclo', () => {
    expect(slrdDelta({ ...base, type: 'gasto' })).toBe(-10000)
  })
  it('should_ReturnZero_When_GastoCreditConCiclo', () => {
    expect(slrdDelta({ ...base, type: 'gasto', billingCycleId: 'abc' })).toBe(0)
  })
  it('should_ReturnZero_When_GastoDebito', () => {
    expect(slrdDelta({ ...base, type: 'gasto', accountType: 'debit' })).toBe(0)
  })
  it('should_ReturnZero_When_GastoInversion', () => {
    expect(slrdDelta({ ...base, type: 'gasto', accountType: 'investment' })).toBe(0)
  })
  it('should_ReturnZero_When_Ingreso', () => {
    expect(slrdDelta({ ...base, type: 'ingreso' })).toBe(0)
  })
  it('should_ReturnZero_When_PagoTarjeta', () => {
    expect(slrdDelta({ ...base, type: 'pago_tarjeta' })).toBe(0)
  })
})
