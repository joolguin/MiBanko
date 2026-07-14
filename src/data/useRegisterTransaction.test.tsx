import { describe, it, expect } from 'vitest'
import { applyOptimistic, buildTransactionInsert } from './useRegisterTransaction'
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

describe('buildTransactionInsert', () => {
  const tx: NewTransaction = {
    accountId: 'acc-1', accountType: 'credit', type: 'gasto', amount: 20000,
    channel: 'wallet_pixel', categoryId: 'cat-1', description: 'Café', billingCycleId: null,
  }

  it('should_StampTransactionDate_When_GivenSantiagoToday', () => {
    // La fecha la fija el cliente en zona Santiago; el default UTC de la
    // columna fechaba de más los gastos registrados de noche.
    const row = buildTransactionInsert(tx, '2026-07-07')
    expect(row.transaction_date).toBe('2026-07-07')
  })

  it('should_MapFieldsToSnakeCase', () => {
    const row = buildTransactionInsert(tx, '2026-07-07')
    expect(row).toEqual({
      account_id: 'acc-1', type: 'gasto', amount: 20000, channel: 'wallet_pixel',
      category_id: 'cat-1', description: 'Café', billing_cycle_id: null,
      transaction_date: '2026-07-07',
    })
  })
})
