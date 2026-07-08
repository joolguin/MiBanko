import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
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
      qc.invalidateQueries({ queryKey: ['latest-snapshots'] })
    },
  })
}

export interface LatestSnapshot { accountId: string; balance: number; snapshotDate: string }

export function useLatestSnapshotsByAccount() {
  return useQuery({
    queryKey: ['latest-snapshots'],
    queryFn: async (): Promise<Record<string, LatestSnapshot>> => {
      const { data, error } = await supabase
        .from('v_latest_snapshots').select('account_id, balance, snapshot_date')
      if (error) throw error
      const out: Record<string, LatestSnapshot> = {}
      for (const r of data as Array<{ account_id: string; balance: number | string; snapshot_date: string }>) {
        out[r.account_id] = { accountId: r.account_id, balance: Number(r.balance ?? 0), snapshotDate: r.snapshot_date }
      }
      return out
    },
  })
}
