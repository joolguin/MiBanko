import type { QueryClient } from '@tanstack/react-query'

// Toda mutación sobre transactions debe invalidar estas keys, o la UI queda
// stale hasta 30s (staleTime global): SLRD, MesScreen, historial y CicloScreen.
export const TX_QUERY_KEYS = [
  ['slrd'],
  ['month-transactions'],
  ['slrd-history'],
  ['current-cycle'],
] as const

export function invalidateTxQueries(qc: QueryClient): void {
  for (const queryKey of TX_QUERY_KEYS) {
    qc.invalidateQueries({ queryKey })
  }
}
