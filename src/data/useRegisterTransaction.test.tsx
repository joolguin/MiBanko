import { describe, it, expect } from 'vitest'
import { applyOptimistic } from './useRegisterTransaction'
import type { Slrd, NewTransaction } from './types'

const slrd: Slrd = {
  slrdInmediato: 115000, slrdTotal: 2115000, saldoContable: 2500000,
  saldoDebito: 500000, saldoInversion: 2000000,
  deudaFacturada: 300000, deudaNoFacturada: 85000,
}
const gastoBice: NewTransaction = {
  accountId: 'a', accountType: 'credit', type: 'gasto', amount: 20000,
  channel: 'wallet_pixel', categoryId: null, description: null, billingCycleId: null,
}

describe('applyOptimistic', () => {
  it('should_DropInmediatoAndTotalAndRaiseDebt_When_GastoBiceSinCiclo', () => {
    const next = applyOptimistic(slrd, gastoBice)
    expect(next.slrdInmediato).toBe(95000)
    expect(next.slrdTotal).toBe(2095000)
    expect(next.deudaNoFacturada).toBe(105000)
    expect(next.saldoContable).toBe(2500000) // no cambia hasta el snapshot
  })
  it('should_NotChange_When_GastoDebito', () => {
    const next = applyOptimistic(slrd, { ...gastoBice, accountType: 'debit' })
    expect(next).toEqual(slrd)
  })
})
