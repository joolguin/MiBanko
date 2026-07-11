import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface ExistingTx {
  transactionDate: string
  amount: number
  description: string | null
}

export interface DateRange {
  from: string
  to: string
}

export function mapExistingTxRow(
  row: { transaction_date: string; amount: string | number; description: string | null },
): ExistingTx {
  return {
    transactionDate: row.transaction_date,
    amount: Number(row.amount),
    description: row.description,
  }
}

export function useImportPreview(accountId: string | undefined, range: DateRange | null) {
  return useQuery({
    queryKey: ['import-preview', accountId, range?.from, range?.to],
    enabled: !!accountId && !!range,
    queryFn: async (): Promise<ExistingTx[]> => {
      const { data, error } = await supabase
        .from('transactions')
        .select('transaction_date, amount, description')
        .eq('account_id', accountId!)
        .gte('transaction_date', range!.from)
        .lte('transaction_date', range!.to)
      if (error) throw error
      return (data ?? []).map(mapExistingTxRow)
    },
  })
}
