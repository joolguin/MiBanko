import type { BiceConfig, CycleDates } from './types'

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10)
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setUTCDate(r.getUTCDate() + n)
  return r
}

// Todas las fechas en UTC (day-only). closingDay/dueDay están en 1..28, sin problemas de fin de mes.
export function deriveCycleDates(config: BiceConfig, closingDate: Date): CycleDates {
  const { closingDay, dueDay } = config
  const y = closingDate.getUTCFullYear()
  const m = closingDate.getUTCMonth() // 0..11
  const day = closingDate.getUTCDate()

  // cycleEnd: el closingDay más reciente <= closingDate.
  let endY = y, endM = m
  if (day < closingDay) {
    endM -= 1
    if (endM < 0) { endM = 11; endY -= 1 }
  }
  const cycleEndDate = new Date(Date.UTC(endY, endM, closingDay))

  // cycleStart: (corte del período anterior) + 1 día.
  const prevEnd = new Date(Date.UTC(endY, endM - 1, closingDay)) // JS normaliza mes -1
  const cycleStartDate = addDays(prevEnd, 1)

  // dueDate: primer dueDay estrictamente después de cycleEnd.
  let dueY = endY, dueM = endM
  if (dueDay <= closingDay) {
    dueM += 1
    if (dueM > 11) { dueM = 0; dueY += 1 }
  }
  const dueDateDate = new Date(Date.UTC(dueY, dueM, dueDay))

  return { cycleStart: fmt(cycleStartDate), cycleEnd: fmt(cycleEndDate), dueDate: fmt(dueDateDate) }
}
