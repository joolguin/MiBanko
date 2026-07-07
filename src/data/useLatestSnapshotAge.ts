import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export function useLatestSnapshotAge() {
  return useQuery({
    queryKey: ['snapshot-age'],
    queryFn: async (): Promise<number | null> => {
      const { data, error } = await supabase
        .from('balance_snapshots')
        .select('snapshot_date')
        .order('snapshot_date', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) return null
      const ms = Date.now() - new Date(data.snapshot_date as string).getTime()
      return Math.floor(ms / 86_400_000)
    },
  })
}
