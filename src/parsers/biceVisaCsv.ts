import Papa from 'papaparse'
import type { RawMovement } from './types'

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/
const NO_CUOTAS = '1 de 1'

export function parseBiceAmount(raw: string): number {
  return Number(raw.replace(/[^\d]/g, '')) || 0
}

export function parseBiceDate(raw: string): string {
  const [dd, mm, yyyy] = raw.split('/')
  return `${yyyy}-${mm}-${dd}`
}

export function extractBiceRows(rows: string[][]): RawMovement[] {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() === 'Fecha'))
  if (headerIdx === -1) return []

  const header = rows[headerIdx].map((c) => c.trim())
  const col = {
    fecha: header.indexOf('Fecha'),
    categoria: header.indexOf('Categoria'),
    detalle: header.indexOf('Detalle'),
    cuotas: header.indexOf('Cuotas'),
    monto: header.findIndex((c) => c.startsWith('Monto')),
  }

  const out: RawMovement[] = []
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const fecha = (rows[i][col.fecha] ?? '').trim()
    if (!DATE_RE.test(fecha)) break

    const detalleRaw = (rows[i][col.detalle] ?? '').trim()
    const cuotas = (rows[i][col.cuotas] ?? '').trim()
    const bankCategory = (rows[i][col.categoria] ?? '').trim()

    out.push({
      date: parseBiceDate(fecha),
      amount: parseBiceAmount(rows[i][col.monto] ?? ''),
      description: detalleRaw.replace(/^\*\s*/, ''),
      kind: 'gasto',
      bankCategory: bankCategory || undefined,
      installments: cuotas && cuotas !== NO_CUOTAS ? cuotas : undefined,
      pending: detalleRaw.startsWith('*') || undefined,
    })
  }
  return out
}

export async function parseBiceVisaCsv(file: File): Promise<RawMovement[]> {
  const text = await file.text()
  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: false })
  return extractBiceRows(data)
}
