import type { RawMovement } from './types'

export interface PdfItem {
  str: string
  x: number
}

export interface PdfLine {
  y: number
  items: PdfItem[] // ordenados por x ascendente
}

const DATE_DDMM = /^\d{2}\/\d{2}$/
const DATE_FULL = /^\d{2}\/\d{2}\/\d{4}$/
const AMOUNT = /^\d{1,3}(?:\.\d{3})*$/

// Coordenadas x del layout real de la Cuentamática.
const DATE_X_MAX = 60
const DESC_X_MIN = 140
const DESC_X_MAX = 360
const AMOUNT_X_MIN = 370
const AMOUNT_X_MAX = 500
// Monto a la izquierda de este x = columna CARGOS (gasto); a la derecha = ABONOS (ingreso).
const CARGO_ABONO_SPLIT_X = 420

function amountToInt(s: string): number {
  return Number(s.replace(/\./g, '')) || 0
}

function toIso(ddmm: string, year: number): string {
  const [dd, mm] = ddmm.split('/')
  return `${year}-${mm}-${dd}`
}

interface DateRange {
  desde: string // ISO
  hasta: string // ISO
}

function findRange(lines: PdfLine[]): DateRange | null {
  const fulls: string[] = []
  for (const line of lines) {
    for (const it of line.items) {
      if (DATE_FULL.test(it.str)) {
        const [dd, mm, yy] = it.str.split('/')
        fulls.push(`${yy}-${mm}-${dd}`)
      }
    }
  }
  if (fulls.length === 0) return null
  const sorted = [...fulls].sort()
  return { desde: sorted[0], hasta: sorted[sorted.length - 1] }
}

function resolveYear(ddmm: string, range: DateRange | null): number {
  if (!range) return new Date().getUTCFullYear()
  const [dd, mm] = ddmm.split('/')
  const desdeY = Number(range.desde.slice(0, 4))
  const hastaY = Number(range.hasta.slice(0, 4))
  if (desdeY === hastaY) return desdeY
  // rango que cruza el año: elegí el año que deja la fecha dentro de [desde, hasta]
  for (const y of [desdeY, hastaY]) {
    const iso = `${y}-${mm}-${dd}`
    if (iso >= range.desde && iso <= range.hasta) return y
  }
  return hastaY
}

function buildDescription(items: PdfItem[]): string {
  return items
    .filter((it) => it.x > DESC_X_MIN && it.x < DESC_X_MAX)
    .filter((it) => it.str !== '93' && !/^\d+$/.test(it.str)) // saca SUC y el numero
    .map((it) => it.str)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseSantanderMovements(lines: PdfLine[]): RawMovement[] {
  const range = findRange(lines)
  const out: RawMovement[] = []
  let currentDay: string | null = null

  for (const line of lines) {
    const dateItem = line.items.find((it) => it.x < DATE_X_MAX && DATE_DDMM.test(it.str))
    if (dateItem) currentDay = dateItem.str

    // línea de cierre de día ("--- Saldo Dia --- <saldo>"): ignorar
    const isSaldoDia =
      line.items.some((it) => it.str === 'Saldo') && line.items.some((it) => it.str === 'Dia')
    if (isSaldoDia) continue

    const amountItem = line.items.find(
      (it) => it.x >= AMOUNT_X_MIN && it.x <= AMOUNT_X_MAX && AMOUNT.test(it.str),
    )
    // '93' es el código de sucursal observado en la cartola de muestra; otra cartola con
    // otro SUC caería en "no reconocidos" (seguro, pero requeriría ampliar este gate).
    const hasSuc = line.items.some((it) => it.str === '93')
    if (!amountItem || !hasSuc || !currentDay) continue

    out.push({
      date: toIso(currentDay, resolveYear(currentDay, range)),
      amount: amountToInt(amountItem.str),
      description: buildDescription(line.items),
      kind: amountItem.x < CARGO_ABONO_SPLIT_X ? 'gasto' : 'ingreso',
    })
  }
  return out
}
