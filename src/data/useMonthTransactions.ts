import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { monthRange } from './monthNav'
import type { MonthKey, MonthTx, TxType, Channel, AccountType } from './types'

export function mapMonthTxRow(row: Record<string, unknown>): MonthTx {
  const categories = row.categories as { name: string } | null
  const accounts = row.accounts as { name: string; type: AccountType }
  return {
    id: String(row.id),
    transactionDate: String(row.transaction_date),
    amount: Number(row.amount ?? 0),
    type: row.type as TxType,
    channel: (row.channel as Channel | null) ?? null,
    categoryName: categories?.name ?? null,
    accountName: accounts.name,
    accountType: accounts.type,
  }
}

export function useMonthTransactions(month: MonthKey) {
  return useQuery({
    queryKey: ['month-transactions', month],
    queryFn: async (): Promise<MonthTx[]> => {
      const { start, endExclusive } = monthRange(month)
      const { data, error } = await supabase
        .from('transactions')
        .select('id, transaction_date, amount, type, channel, categories(name), accounts!inner(name, type)')
        .gte('transaction_date', start)
        .lt('transaction_date', endExclusive)
        .order('transaction_date', { ascending: false })
      if (error) throw error
      return (data as unknown as Record<string, unknown>[]).map(mapMonthTxRow)
    },
  })
}
