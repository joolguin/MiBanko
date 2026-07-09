import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { Channel, Subscription, SubscriptionInput } from './types'

export function mapSubscriptionRow(row: Record<string, string | number | boolean | null>): Subscription {
  return {
    id: String(row.id),
    name: String(row.name),
    amount: Number(row.amount ?? 0),
    chargeDayOfMonth: Number(row.charge_day_of_month ?? 1),
    categoryId: row.category_id ? String(row.category_id) : null,
    channel: String(row.channel) as Channel,
    isActive: Boolean(row.is_active),
  }
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: async (): Promise<Subscription[]> => {
      const { data, error } = await supabase
        .from('fixed_subscriptions')
        .select('id, name, amount, charge_day_of_month, category_id, channel, is_active')
        .order('charge_day_of_month')
      if (error) throw error
      return (data as Record<string, string | number | boolean | null>[]).map(mapSubscriptionRow)
    },
  })
}

export function useSaveSubscription() {
  const qc = useQueryClient()
  return useMutation<void, Error, SubscriptionInput>({
    mutationFn: async (s) => {
      const row = {
        ...(s.id ? { id: s.id } : {}),
        name: s.name,
        amount: s.amount,
        charge_day_of_month: s.chargeDayOfMonth,
        category_id: s.categoryId,
        channel: s.channel,
      }
      const { error } = await supabase.from('fixed_subscriptions').upsert(row)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })
}

export function useToggleSubscription() {
  const qc = useQueryClient()
  return useMutation<void, Error, { id: string; isActive: boolean }>({
    mutationFn: async ({ id, isActive }) => {
      const { error } = await supabase.from('fixed_subscriptions').update({ is_active: isActive }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })
}

export function useDeleteSubscription() {
  const qc = useQueryClient()
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const { error } = await supabase.from('fixed_subscriptions').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  })
}
