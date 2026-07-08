import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { slrdDelta } from './slrdDelta'
import type { Slrd, NewTransaction } from './types'

export function applyOptimistic(prev: Slrd, tx: NewTransaction): Slrd {
  const delta = slrdDelta({
    type: tx.type, accountType: tx.accountType,
    billingCycleId: tx.billingCycleId, amount: tx.amount,
  })
  if (delta === 0) return prev
  // delta es negativo para un gasto BICE sin facturar: baja el SLRD y sube la deuda.
  return {
    ...prev,
    slrdInmediato: prev.slrdInmediato + delta,
    slrdTotal: prev.slrdTotal + delta,
    deudaNoFacturada: prev.deudaNoFacturada - delta,
  }
}

export function useRegisterTransaction() {
  const qc = useQueryClient()
  return useMutation<void, Error, NewTransaction, { prev?: Slrd }>({
    mutationFn: async (tx) => {
      const { error } = await supabase.from('transactions').insert({
        account_id: tx.accountId,
        type: tx.type,
        amount: tx.amount,
        channel: tx.channel,
        category_id: tx.categoryId,
        description: tx.description,
        billing_cycle_id: tx.billingCycleId,
      })
      if (error) throw new Error(error.message)
    },
    onMutate: async (tx) => {
      await qc.cancelQueries({ queryKey: ['slrd'] })
      const prev = qc.getQueryData<Slrd>(['slrd'])
      if (prev) qc.setQueryData<Slrd>(['slrd'], applyOptimistic(prev, tx))
      return { prev }
    },
    onError: (_e, _tx, ctx) => {
      if (ctx?.prev) qc.setQueryData(['slrd'], ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
    },
  })
}
