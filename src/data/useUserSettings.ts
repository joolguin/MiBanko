import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { UserSettings } from './types'

const DEFAULT_FRESH_LIMIT_DAYS = 4

export function mapSettingsRow(row: { fresh_limit_days: number } | null): UserSettings {
  if (!row) return { freshLimitDays: DEFAULT_FRESH_LIMIT_DAYS }
  return { freshLimitDays: Number(row.fresh_limit_days) }
}

export function useUserSettings() {
  return useQuery({
    queryKey: ['user-settings'],
    queryFn: async (): Promise<UserSettings> => {
      const { data, error } = await supabase
        .from('user_settings').select('fresh_limit_days').maybeSingle()
      if (error) throw error
      return mapSettingsRow(data as { fresh_limit_days: number } | null)
    },
  })
}

export function useSaveUserSettings() {
  const qc = useQueryClient()
  return useMutation<void, Error, UserSettings>({
    mutationFn: async (s) => {
      const { error } = await supabase.from('user_settings').upsert(
        { fresh_limit_days: s.freshLimitDays, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-settings'] }),
  })
}
