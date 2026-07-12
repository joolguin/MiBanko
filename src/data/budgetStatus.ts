import type { MonthTx, Budget, Category, BudgetState, BudgetStatus } from './types'

export const WARN_THRESHOLD = 0.8
export const OVER_THRESHOLD = 1.0

export function budgetState(pct: number): BudgetState {
  if (pct >= OVER_THRESHOLD) return 'over'
  if (pct >= WARN_THRESHOLD) return 'warn'
  return 'ok'
}

export function stateRank(state: BudgetState): number {
  return state === 'over' ? 2 : state === 'warn' ? 1 : 0
}

export function computeBudgetStatus(
  txs: MonthTx[],
  budgets: Budget[],
  categories: Category[],
): BudgetStatus[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const spentByCat = new Map<string, number>()
  for (const t of txs) {
    if (t.type !== 'gasto' || t.categoryId === null) continue
    spentByCat.set(t.categoryId, (spentByCat.get(t.categoryId) ?? 0) + t.amount)
  }

  return budgets
    .map((b): BudgetStatus => {
      const spent = spentByCat.get(b.categoryId) ?? 0
      const pct = b.amount > 0 ? spent / b.amount : 0
      return {
        categoryId: b.categoryId,
        categoryName: nameById.get(b.categoryId) ?? 'Sin categoría',
        amount: b.amount,
        spent,
        pct,
        state: budgetState(pct),
      }
    })
    .sort((a, b) => b.pct - a.pct)
}

export function categoriesWithoutBudget(
  categories: Category[],
  budgets: Budget[],
): Category[] {
  const budgeted = new Set(budgets.map((b) => b.categoryId))
  return categories.filter((c) => !budgeted.has(c.id))
}
