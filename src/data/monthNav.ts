import type { MonthKey } from './types'

const SANTIAGO = 'America/Santiago'

export function currentMonthKey(today: Date): MonthKey {
  // 'en-CA' produce 'AAAA-MM-DD'; nos quedamos con 'AAAA-MM'.
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: SANTIAGO }).format(today)
  return ymd.slice(0, 7)
}

function parse(month: MonthKey): { year: number; monthIndex: number } {
  const [year, monthNumber] = month.split('-').map(Number)
  return { year, monthIndex: monthNumber - 1 } // monthIndex 0..11
}

function format(year: number, monthIndex: number): MonthKey {
  const normalizedYear = year + Math.floor(monthIndex / 12)
  const normalizedMonth = ((monthIndex % 12) + 12) % 12
  return `${normalizedYear}-${String(normalizedMonth + 1).padStart(2, '0')}`
}

export function shiftMonth(month: MonthKey, delta: -1 | 1): MonthKey {
  const { year, monthIndex } = parse(month)
  return format(year, monthIndex + delta)
}

export function monthLabel(month: MonthKey): string {
  // Mediodía con offset fijo evita cualquier corrimiento de día al formatear.
  const date = new Date(`${month}-01T12:00:00-04:00`)
  const monthName = new Intl.DateTimeFormat('es-CL', {
    month: 'long', timeZone: SANTIAGO,
  }).format(date)
  const year = new Intl.DateTimeFormat('es-CL', {
    year: 'numeric', timeZone: SANTIAGO,
  }).format(date)
  const capitalizedMonthName = monthName.charAt(0).toUpperCase() + monthName.slice(1)
  return `${capitalizedMonthName} ${year}`
}

export function monthRange(month: MonthKey): { start: string; endExclusive: string } {
  return { start: `${month}-01`, endExclusive: `${shiftMonth(month, 1)}-01` }
}
