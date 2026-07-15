import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { currentMonthKey, lastCompleteMonths, monthRange } from './monthNav'
import { mapMonthTxRow } from './useMonthTransactions'
import type { MonthTx, MonthKey } from './types'

export const AVG_MAX_MONTHS = 6

export function useCategoryAverages(): {
  rows: MonthTx[]
  monthKeys: MonthKey[]
  isLoading: boolean
  isError: boolean
} {
  const monthKeys = lastCompleteMonths(currentMonthKey(new Date()), AVG_MAX_MONTHS)
  const { start } = monthRange(monthKeys[0])
  const { endExclusive } = monthRange(monthKeys[monthKeys.length - 1])

  const query = useQuery({
    // El rango (start, endExclusive) depende de 'hoy': incluirlo en la key evita
    // servir cache del rango viejo al cruzar un borde de mes con la app abierta.
    queryKey: ['category-averages', start, endExclusive],
    queryFn: async (): Promise<MonthTx[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount, type, channel, category_id, categories(name), accounts!inner(name, type)')
        .eq('type', 'gasto')
        .not('category_id', 'is', null)
        .gte('transaction_date', start)
        .lt('transaction_date', endExclusive)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return ((data ?? []) as unknown as Record<string, unknown>[]).map(mapMonthTxRow)
    },
  })

  return {
    rows: query.data ?? [],
    monthKeys,
    isLoading: query.isLoading,
    isError: query.isError,
  }
}
