import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface CycleTx {
  id: string
  amount: number
  description: string | null
  transactionDate: string
  categoryName: string | null
}

export function useCurrentCycleTransactions() {
  return useQuery({
    queryKey: ['current-cycle'],
    queryFn: async (): Promise<{ items: CycleTx[]; total: number }> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, amount, description, transaction_date, categories(name), accounts!inner(type)')
        .eq('type', 'gasto')
        .is('billing_cycle_id', null)
        .eq('accounts.type', 'credit')
        .order('transaction_date', { ascending: false })
      if (error) throw error
      const rows = data as unknown as Array<{
        id: string; amount: string | number; description: string | null;
        transaction_date: string; categories: { name: string } | null
      }>
      const items: CycleTx[] = rows.map((r) => ({
        id: r.id,
        amount: Number(r.amount ?? 0),
        description: r.description,
        transactionDate: r.transaction_date,
        categoryName: r.categories?.name ?? null,
      }))
      const total = items.reduce((s, i) => s + i.amount, 0)
      return { items, total }
    },
  })
}
