import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Snapshotea el SLRD del día al abrir la app (upsert idempotente en el server).
// Gemelo de useRunDueSubscriptions, pero sin guard diario: el upsert es barato
// y self-correcting, así que corre una vez por carga de app.
export function useSnapshotSlrd(): void {
  const qc = useQueryClient()
  useEffect(() => {
    if (typeof window === 'undefined') return
    supabase.rpc('snapshot_slrd').then(({ error }) => {
      if (error) return
      qc.invalidateQueries({ queryKey: ['slrd-history'] })
    })
  }, [qc])
}
