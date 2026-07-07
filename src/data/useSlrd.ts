import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Slrd } from './types'

export function mapSlrdRow(row: Record<string, string | number | null>): Slrd {
  const n = (v: string | number | null) => Number(v ?? 0)
  return {
    slrdInmediato: n(row.slrd_inmediato),
    slrdTotal: n(row.slrd_total),
    saldoContable: n(row.saldo_contable),
    saldoDebito: n(row.saldo_debito),
    saldoInversion: n(row.saldo_inversion),
    deudaFacturada: n(row.deuda_facturada),
    deudaNoFacturada: n(row.deuda_no_facturada),
  }
}

const EMPTY: Slrd = {
  slrdInmediato: 0, slrdTotal: 0, saldoContable: 0, saldoDebito: 0,
  saldoInversion: 0, deudaFacturada: 0, deudaNoFacturada: 0,
}

export function useSlrd() {
  return useQuery({
    queryKey: ['slrd'],
    queryFn: async (): Promise<Slrd> => {
      const { data, error } = await supabase.from('v_slrd').select('*').maybeSingle()
      if (error) throw error
      return data ? mapSlrdRow(data as Record<string, string | number | null>) : EMPTY
    },
  })
}
