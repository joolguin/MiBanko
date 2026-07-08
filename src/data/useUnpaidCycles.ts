import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { BillingCycle } from './types'

export function mapCycleRow(row: Record<string, string | number | boolean | null>): BillingCycle {
  return {
    id: String(row.id),
    cycleStart: String(row.cycle_start),
    cycleEnd: String(row.cycle_end),
    dueDate: String(row.due_date),
    billedAmount: Number(row.billed_amount ?? 0),
    isPaid: Boolean(row.is_paid),
  }
}

export function useUnpaidCycles() {
  return useQuery({
    queryKey: ['unpaid-cycles'],
    queryFn: async (): Promise<BillingCycle[]> => {
      const { data, error } = await supabase
        .from('bice_billing_cycles')
        .select('id, cycle_start, cycle_end, due_date, billed_amount, is_paid')
        .eq('is_paid', false)
        .order('due_date')
      if (error) throw error
      return (data as Record<string, string | number | boolean | null>[]).map(mapCycleRow)
    },
  })
}

export function usePaidCycles() {
  return useQuery({
    queryKey: ['paid-cycles'],
    queryFn: async (): Promise<BillingCycle[]> => {
      const { data, error } = await supabase
        .from('bice_billing_cycles')
        .select('id, cycle_start, cycle_end, due_date, billed_amount, is_paid')
        .eq('is_paid', true)
        .order('due_date', { ascending: false })
      if (error) throw error
      return (data as Record<string, string | number | boolean | null>[]).map(mapCycleRow)
    },
  })
}
