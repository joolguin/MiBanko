import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ImportRow {
  date: string
  amount: number
  description: string
  kind: 'gasto' | 'ingreso'
  categoryId: string | null
}

export interface ImportPayload {
  accountId: string
  billingCycleId: string | null
  rows: ImportRow[]
}

export interface TransactionInsert {
  account_id: string
  type: 'gasto' | 'ingreso'
  amount: number
  transaction_date: string
  channel: null
  category_id: string | null
  description: string
  billing_cycle_id: string | null
  source: 'import'
}

export function buildImportInserts(payload: ImportPayload): TransactionInsert[] {
  return payload.rows.map((r) => ({
    account_id: payload.accountId,
    type: r.kind,
    amount: r.amount,
    transaction_date: r.date,
    channel: null,
    category_id: r.categoryId,
    description: r.description,
    billing_cycle_id: payload.billingCycleId,
    source: 'import',
  }))
}

export function useImportTransactions() {
  const qc = useQueryClient()
  return useMutation<void, Error, ImportPayload>({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('transactions').insert(buildImportInserts(payload))
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['month-transactions'] })
      qc.invalidateQueries({ queryKey: ['slrd-history'] })
      qc.invalidateQueries({ queryKey: ['current-cycle'] })
    },
  })
}
