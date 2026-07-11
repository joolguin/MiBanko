import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { parseSantanderMovements, type PdfLine } from './santanderPdf'
import type { RawMovement } from './types'

GlobalWorkerOptions.workerSrc = workerUrl

// Extrae cada página como líneas de items posicionados (agrupados por y, ordenados por x).
export async function extractPdfLines(file: File): Promise<PdfLine[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const lines: PdfLine[] = []

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const byY = new Map<number, { str: string; x: number }[]>()

    for (const item of content.items) {
      if (!('str' in item) || item.str.trim() === '') continue
      const y = Math.round(item.transform[5])
      const x = Math.round(item.transform[4])
      const row = byY.get(y) ?? []
      row.push({ str: item.str, x })
      byY.set(y, row)
    }

    const ys = [...byY.keys()].sort((a, b) => b - a) // de arriba hacia abajo
    for (const y of ys) {
      lines.push({ y, items: byY.get(y)!.sort((a, b) => a.x - b.x) })
    }
  }
  return lines
}

export async function parseSantanderPdf(file: File): Promise<RawMovement[]> {
  return parseSantanderMovements(await extractPdfLines(file))
}
