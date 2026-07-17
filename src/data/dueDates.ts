const DAY_MS = 86_400_000

// Distancia en días de calendario entre `today` (day-only UTC, ver santiagoDate.ts)
// y una fecha 'AAAA-MM-DD'. Positivo = futuro, negativo = ya pasó.
export function daysUntil(dateKey: string, today: Date): number {
  return Math.round((Date.parse(`${dateKey}T00:00:00Z`) - today.getTime()) / DAY_MS)
}

// Coletilla humana para un vencimiento: la app hace la resta, no la usuaria.
export function dueDistanceLabel(days: number): string {
  if (days > 1) return `en ${days} días`
  if (days === 1) return 'mañana'
  if (days === 0) return 'hoy'
  if (days === -1) return 'ayer'
  return `hace ${-days} días`
}
