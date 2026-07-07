import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Account, AccountType } from './types'

// BICE (credit) primero para que sea el default del registro.
const ORDER: Record<AccountType, number> = { credit: 0, debit: 1, investment: 2 }

export function useAccounts() {
  return useQuery({
    queryKey: ['accounts'],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from('accounts').select('id, name, type, bank').eq('is_active', true)
      if (error) throw error
      return (data as Account[]).sort((a, b) => ORDER[a.type] - ORDER[b.type])
    },
  })
}
