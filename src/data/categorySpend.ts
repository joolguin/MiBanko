import type { MonthTx, CategorySpendSegment } from './types'

export const TOP_CATEGORIES = 6
const UNCATEGORIZED = 'Sin categoría'
const OTHER = 'Otros'

export function computeCategorySpend(txs: MonthTx[]): CategorySpendSegment[] {
  const gastos = txs.filter((t) => t.type === 'gasto')
  if (gastos.length === 0) return []

  const totals = new Map<string, number>()
  for (const t of gastos) {
    const label = t.categoryName ?? UNCATEGORIZED
    totals.set(label, (totals.get(label) ?? 0) + t.amount)
  }

  const total = gastos.reduce((sum, t) => sum + t.amount, 0)
  const sorted = [...totals.entries()]
    .map(([label, amount]) => ({ label, amount }))
    .sort((a, b) => b.amount - a.amount)

  const top = sorted.slice(0, TOP_CATEGORIES)
  const rest = sorted.slice(TOP_CATEGORIES)

  const toPct = (amount: number): number => (total === 0 ? 0 : (amount / total) * 100)
  const segments: CategorySpendSegment[] = top.map((s) => ({
    label: s.label, amount: s.amount, pct: toPct(s.amount),
  }))

  if (rest.length > 0) {
    const otherAmount = rest.reduce((sum, s) => sum + s.amount, 0)
    segments.push({ label: OTHER, amount: otherAmount, pct: toPct(otherAmount) })
  }

  return segments
}
