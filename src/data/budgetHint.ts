import { budgetState, stateRank } from './budgetStatus'
import type { Budget, MonthTx } from './types'

export interface BudgetHint {
  categoryName: string
  projectedSpent: number
  amount: number
  pct: number
  state: 'warn' | 'over'
}

export function budgetHint(
  categoryId: string | null,
  addedAmount: number,
  monthTxs: MonthTx[],
  budgets: Budget[],
  categoryName: string,
): BudgetHint | null {
  if (categoryId === null || addedAmount <= 0) return null
  const budget = budgets.find((b) => b.categoryId === categoryId)
  if (!budget || budget.amount <= 0) return null

  const current = monthTxs
    .filter((t) => t.type === 'gasto' && t.categoryId === categoryId)
    .reduce((sum, t) => sum + t.amount, 0)
  const projectedSpent = current + addedAmount

  const currentState = budgetState(current / budget.amount)
  const projectedState = budgetState(projectedSpent / budget.amount)

  // Solo avisa si el gasto CRUZA a un estado peor (ok→warn/over, warn→over).
  if (stateRank(projectedState) <= stateRank(currentState)) return null

  return {
    categoryName,
    projectedSpent,
    amount: budget.amount,
    pct: projectedSpent / budget.amount,
    state: projectedState as 'warn' | 'over',
  }
}
