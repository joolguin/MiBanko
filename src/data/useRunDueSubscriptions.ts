import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

const KEY = 'mibanko:subs-run'

export function todayKey(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(now)
}

export function shouldRun(storage: Pick<Storage, 'getItem'>, now: Date): boolean {
  return storage.getItem(KEY) !== todayKey(now)
}

export function markRan(storage: Pick<Storage, 'setItem'>, now: Date): void {
  storage.setItem(KEY, todayKey(now))
}

export function useRunDueSubscriptions(): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined') return
    const now = new Date()
    if (!shouldRun(window.localStorage, now)) return
    markRan(window.localStorage, now) // marca antes: evita doble disparo (StrictMode)
    supabase.rpc('run_due_subscriptions').then(({ error }) => {
      if (error) return
      qc.invalidateQueries({ queryKey: ['slrd'] })
      qc.invalidateQueries({ queryKey: ['current-cycle'] })
    })
  }, [qc])
}
