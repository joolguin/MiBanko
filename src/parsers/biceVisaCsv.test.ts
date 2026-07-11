import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Papa from 'papaparse'
import {
  parseBiceAmount, parseBiceDate, extractBiceRows, parseBiceVisaCsv,
} from './biceVisaCsv'

const fixtureText = readFileSync(
  join(__dirname, '__fixtures__', 'bice-visa-sample.csv'), 'utf-8',
)

describe('parseBiceAmount', () => {
  it('should_TreatCommaAsThousands_When_ParsingMonto', () => {
    expect(parseBiceAmount('5,500')).toBe(5500)
    expect(parseBiceAmount('11.220 CLP')).toBe(11220)
    expect(parseBiceAmount('')).toBe(0)
  })
})

describe('parseBiceDate', () => {
  it('should_ConvertToIso_When_GivenDdMmYyyy', () => {
    expect(parseBiceDate('10/07/2026')).toBe('2026-07-10')
  })
})

describe('extractBiceRows', () => {
  it('should_ReturnMovements_When_GivenParsedMatrix', () => {
    const matrix = Papa.parse<string[]>(fixtureText, { skipEmptyLines: false }).data

    const rows = extractBiceRows(matrix)

    expect(rows).toHaveLength(3)
    expect(rows[0]).toEqual({
      date: '2026-07-10', amount: 5500,
      description: 'GOOGLE PLAY YOUTUBE GO COMPRAS', kind: 'gasto',
      bankCategory: 'Hogar', installments: undefined, pending: true,
    })
    expect(rows[2]).toEqual({
      date: '2026-07-07', amount: 3250,
      description: 'ROSARIO NORTE COMPRAS', kind: 'gasto',
      bankCategory: 'Autos Y Transporte', installments: undefined, pending: undefined,
    })
  })

  it('should_StopAtFooter_When_FechaIsNotADate', () => {
    const matrix = Papa.parse<string[]>(fixtureText, { skipEmptyLines: false }).data
    const rows = extractBiceRows(matrix)
    // el footer "* Movimientos sujetos..." no debe colarse como movimiento
    expect(rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date))).toBe(true)
  })
})

describe('parseBiceVisaCsv', () => {
  it('should_ParseFile_When_GivenCartolaCsv', async () => {
    const file = new File([fixtureText], 'cartola.csv', { type: 'text/csv' })

    const rows = await parseBiceVisaCsv(file)

    expect(rows).toHaveLength(3)
    expect(rows[0].amount).toBe(5500)
  })
})
