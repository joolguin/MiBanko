import type { MonthTx, MonthKey } from './types'

export interface CategoryAverage {
  avg: number
  monthsCounted: number
}

function monthOf(tx: MonthTx): string {
  return tx.transactionDate.slice(0, 7)
}

export function computeCategoryAverages(
  rows: MonthTx[],
  windowMonths: number,
  monthKeys: MonthKey[],
): Map<string, CategoryAverage> {
  const result = new Map<string, CategoryAverage>()
  const windowSet = new Set(monthKeys)

  const qualifying = rows.filter(
    (t) => t.type === 'gasto' && t.categoryId !== null && windowSet.has(monthOf(t)),
  )
  if (qualifying.length === 0) return result

  const monthsWithActivity = new Set(qualifying.map(monthOf))
  const monthsCounted = Math.min(monthsWithActivity.size, windowMonths)
  if (monthsCounted === 0) return result

  const totals = new Map<string, number>()
  for (const t of qualifying) {
    const categoryId = t.categoryId as string
    totals.set(categoryId, (totals.get(categoryId) ?? 0) + t.amount)
  }

  for (const [categoryId, total] of totals) {
    result.set(categoryId, { avg: total / monthsCounted, monthsCounted })
  }

  return result
}
