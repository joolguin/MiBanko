import { describe, it, expect } from 'vitest'
import { mapSlrdHistoryRow } from './useSlrdHistory'

describe('mapSlrdHistoryRow', () => {
  it('should_MapSnakeCaseRow_When_GivenDbRow', () => {
    const row = {
      snapshot_date: '2026-07-09',
      slrd_inmediato: '1000', slrd_total: 1500, saldo_contable: '2000',
      saldo_debito: 1200, saldo_inversion: 500,
      deuda_facturada: '100', deuda_no_facturada: 100,
    }

    const point = mapSlrdHistoryRow(row)

    expect(point).toEqual({
      snapshotDate: '2026-07-09',
      slrdInmediato: 1000, slrdTotal: 1500, saldoContable: 2000,
      saldoDebito: 1200, saldoInversion: 500,
      deudaFacturada: 100, deudaNoFacturada: 100,
    })
  })

  it('should_DefaultNumbersToZero_When_FieldsAreNull', () => {
    const point = mapSlrdHistoryRow({ snapshot_date: '2026-07-09', slrd_inmediato: null })

    expect(point.slrdInmediato).toBe(0)
    expect(point.saldoContable).toBe(0)
  })
})
