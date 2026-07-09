import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { SlrdHistoryPoint } from './types'

export function mapSlrdHistoryRow(row: Record<string, string | number | null>): SlrdHistoryPoint {
  const n = (v: string | number | null) => Number(v ?? 0)
  return {
    snapshotDate: String(row.snapshot_date),
    slrdInmediato: n(row.slrd_inmediato),
    slrdTotal: n(row.slrd_total),
    saldoContable: n(row.saldo_contable),
    saldoDebito: n(row.saldo_debito),
    saldoInversion: n(row.saldo_inversion),
    deudaFacturada: n(row.deuda_facturada),
    deudaNoFacturada: n(row.deuda_no_facturada),
  }
}

export function useSlrdHistory() {
  return useQuery({
    queryKey: ['slrd-history'],
    queryFn: async (): Promise<SlrdHistoryPoint[]> => {
      const { data, error } = await supabase
        .from('slrd_history')
        .select('snapshot_date, slrd_inmediato, slrd_total, saldo_contable, saldo_debito, saldo_inversion, deuda_facturada, deuda_no_facturada')
        .order('snapshot_date')
      if (error) throw error
      return (data as Record<string, string | number | null>[]).map(mapSlrdHistoryRow)
    },
  })
}
