import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function usePayCycle() {
  const qc = useQueryClient()
  return useMutation<void, Error, { cycleId: string; santanderAccountId: string; nuevoSaldo: number }>({
    mutationFn: async ({ cycleId, santanderAccountId, nuevoSaldo }) => {
      const { error } = await supabase.rpc('pay_cycle', {
        p_cycle_id: cycleId,
        p_santander_account_id: santanderAccountId,
        p_nuevo_saldo: nuevoSaldo,
      })
      if (error) throw new Error(error.message)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['unpaid-cycles'] })
      qc.invalidateQueries({ queryKey: ['paid-cycles'] })
      qc.invalidateQueries({ queryKey: ['snapshot-age'] })
    },
  })
}
