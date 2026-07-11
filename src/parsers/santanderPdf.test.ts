import { describe, it, expect } from 'vitest'
import { parseSantanderMovements, type PdfLine } from './santanderPdf'

// Fixtures derivados de la salida real de pdf.js (cuenta Cuentamática).
// Rango de la cartola: DESDE 29/05/2026 HASTA 30/06/2026.
const rangeLines: PdfLine[] = [
  { y: 663, items: [{ str: '78', x: 375 }, { str: '29/05/2026', x: 409 }] },
  { y: 662, items: [{ str: '30/06/2026', x: 461 }] },
]

// Día 01/06: un abono (Transf de, x≈462) y una compra (cargo, x≈395)
const day1: PdfLine[] = [
  { y: 546, items: [
    { str: '01/06', x: 31 }, { str: '93', x: 132 }, { str: '0091538369', x: 160 },
    { str: 'Transf', x: 213 }, { str: 'de', x: 246 }, { str: 'LILIANA', x: 261 },
    { str: 'D', x: 299 }, { str: '250.000', x: 462 },
  ] },
  { y: 537, items: [
    { str: '6150757', x: 73 }, { str: '93', x: 132 }, { str: 'Compra', x: 160 },
    { str: 'Nacional', x: 194 }, { str: 'STA.', x: 237 }, { str: 'ISABEL', x: 261 },
    { str: 'AP', x: 294 }, { str: '1.750', x: 395 },
  ] },
  { y: 483, items: [
    { str: '---', x: 160 }, { str: 'Saldo', x: 179 }, { str: 'Dia', x: 208 },
    { str: '---', x: 227 }, { str: '261.990', x: 544 },
  ] },
]

// Día 02/06 (fecha nueva a la izquierda): una compra
const day2: PdfLine[] = [
  { y: 465, items: [
    { str: '02/06', x: 31 }, { str: '6153631', x: 73 }, { str: '93', x: 132 },
    { str: 'Compra', x: 160 }, { str: 'Nacional', x: 194 }, { str: 'CAFETERIA', x: 237 },
    { str: 'TAKE', x: 285 }, { str: '3.800', x: 395 },
  ] },
]

describe('parseSantanderMovements', () => {
  it('should_ClassifyByColumn_When_ChequeVsAbono', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1])

    // el abono (x≈462) es ingreso; la compra (x≈395) es gasto
    expect(rows).toEqual([
      { date: '2026-06-01', amount: 250000, description: 'Transf de LILIANA D', kind: 'ingreso' },
      { date: '2026-06-01', amount: 1750, description: 'Compra Nacional STA. ISABEL AP', kind: 'gasto' },
    ])
  })

  it('should_SkipSaldoDiaLines_When_Parsing', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1])
    expect(rows.every((r) => !r.description.includes('Saldo'))).toBe(true)
    expect(rows).toHaveLength(2) // la línea "--- Saldo Dia --- 261.990" no cuenta
  })

  it('should_CarryDayForward_When_NoDateOnLine', () => {
    // day1 fija 01/06; su segunda línea (compra) no trae fecha y debe heredar 01/06
    const rows = parseSantanderMovements([...rangeLines, ...day1])
    expect(rows[1].date).toBe('2026-06-01')
  })

  it('should_UseNewDate_When_LineHasDateAtLeft', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1, ...day2])
    expect(rows[rows.length - 1]).toEqual({
      date: '2026-06-02', amount: 3800,
      description: 'Compra Nacional CAFETERIA TAKE', kind: 'gasto',
    })
  })

  it('should_StripNumeroFromDescription_When_Transfer', () => {
    const rows = parseSantanderMovements([...rangeLines, ...day1])
    // el numero de transferencia (0091538369) no debe aparecer en la glosa
    expect(rows[0].description).toBe('Transf de LILIANA D')
  })
})
