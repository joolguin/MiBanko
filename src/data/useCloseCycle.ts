import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { invalidateTxQueries } from './txInvalidation'
import type { CloseCycleResult, CycleDates } from './types'

export function useCloseCycle() {
  const qc = useQueryClient()
  return useMutation<CloseCycleResult, Error, { billedAmount: number; dates: CycleDates }>({
    mutationFn: async ({ billedAmount, dates }) => {
      const { data, error } = await supabase.rpc('close_cycle', {
        p_billed_amount: billedAmount,
        p_cycle_start: dates.cycleStart,
        p_cycle_end: dates.cycleEnd,
        p_due_date: dates.dueDate,
      })
      if (error) throw new Error(error.message)
      const r = data as { cycle_id: string; billed_amount: number | string; suma_ledger: number | string; diferencia: number | string }
      return {
        cycleId: r.cycle_id,
        billedAmount: Number(r.billed_amount),
        sumaLedger: Number(r.suma_ledger),
        diferencia: Number(r.diferencia),
      }
    },
    onSettled: () => {
      // close_cycle asigna billing_cycle_id a los gastos sueltos: es una
      // mutación sobre transactions, así que invalida el set completo.
      invalidateTxQueries(qc)
      qc.invalidateQueries({ queryKey: ['unpaid-cycles'] })
    },
  })
}
