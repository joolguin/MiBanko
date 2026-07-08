import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BiceConfig } from './types'

export function mapConfigRow(row: { closing_day: number; due_day: number } | null): BiceConfig | null {
  if (!row) return null
  return { closingDay: Number(row.closing_day), dueDay: Number(row.due_day) }
}

export function useBiceConfig() {
  return useQuery({
    queryKey: ['bice-config'],
    queryFn: async (): Promise<BiceConfig | null> => {
      const { data, error } = await supabase
        .from('bice_config').select('closing_day, due_day').maybeSingle()
      if (error) throw error
      return mapConfigRow(data as { closing_day: number; due_day: number } | null)
    },
  })
}

export function useSaveBiceConfig() {
  const qc = useQueryClient()
  return useMutation<void, Error, BiceConfig>({
    mutationFn: async (cfg) => {
      const { error } = await supabase.from('bice_config').upsert(
        { closing_day: cfg.closingDay, due_day: cfg.dueDay, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bice-config'] }),
  })
}
