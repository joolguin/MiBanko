import { describe, it, expect } from 'vitest'
import { mapSlrdRow } from './useSlrd'

describe('mapSlrdRow', () => {
  it('should_ParseStringNumerics_When_SupabaseReturnsStrings', () => {
    const row = {
      slrd_inmediato: '115000', slrd_total: '2115000', saldo_contable: '2500000',
      saldo_debito: '500000', saldo_inversion: '2000000',
      deuda_facturada: '300000', deuda_no_facturada: '85000',
    }
    expect(mapSlrdRow(row)).toEqual({
      slrdInmediato: 115000, slrdTotal: 2115000, saldoContable: 2500000,
      saldoDebito: 500000, saldoInversion: 2000000,
      deudaFacturada: 300000, deudaNoFacturada: 85000,
    })
  })
})
