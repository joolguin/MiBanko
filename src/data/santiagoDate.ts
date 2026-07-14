const SANTIAGO = 'America/Santiago'

// Fecha de calendario ('AAAA-MM-DD') del instante en America/Santiago.
// 'en-CA' produce el formato ISO. La app corre sobre UTC (DB y navegador
// pueden no estar en Santiago), así que "hoy" siempre se deriva por zona.
export function santiagoDateKey(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: SANTIAGO }).format(instant)
}

// El mismo día de calendario como Date day-only en UTC: sus getters UTC
// (getUTCFullYear/Month/Date) leen la fecha de Santiago, no la del instante.
// Pensado para alimentar deriveCycleDates, que opera con getters UTC.
export function santiagoToday(instant: Date): Date {
  return new Date(`${santiagoDateKey(instant)}T00:00:00Z`)
}
