import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Budget, BudgetInput } from './types'

export function mapBudgetRow(row: Record<string, string | number | null>): Budget {
  return {
    id: String(row.id),
    categoryId: String(row.category_id),
    amount: Number(row.amount ?? 0),
  }
}

export function useBudgets() {
  return useQuery({
    queryKey: ['budgets'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Budget[]> => {
      const { data, error } = await supabase
        .from('budgets').select('id, category_id, amount')
      if (error) throw error
      return (data as Record<string, string | number | null>[]).map(mapBudgetRow)
    },
  })
}

export function useSaveBudget() {
  const qc = useQueryClient()
  return useMutation<void, Error, BudgetInput>({
    mutationFn: async (b) => {
      const row = { category_id: b.categoryId, amount: b.amount, updated_at: new Date().toISOString() }
      const { error } = await supabase.from('budgets').upsert(row, { onConflict: 'category_id' })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}

export function useDeleteBudget() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (categoryId) => {
      const { error } = await supabase.from('budgets').delete().eq('category_id', categoryId)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })
}
