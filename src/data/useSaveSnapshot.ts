import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useSaveSnapshot() {
  const qc = useQueryClient()
  return useMutation<void, Error, { accountId: string; balance: number }[]>({
    mutationFn: async (snapshots) => {
      if (snapshots.length === 0) return
      const rows = snapshots.map((s) => ({ account_id: s.accountId, balance: s.balance }))
      const { error } = await supabase.from('balance_snapshots').insert(rows)
      if (error) throw new Error(error.message)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['snapshot-age'] })
    },
  })
}
