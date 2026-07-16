import { useState } from 'react'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { useBudgets } from '../../data/useBudgets'
import { useCategories } from '../../data/useCategories'
import { computeBudgetStatus, categoriesWithoutBudget } from '../../data/budgetStatus'
import { BudgetSheet } from './BudgetSheet'
import { MonthNav } from './MonthNav'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import type { BudgetState, MonthKey } from '../../data/types'

const BAR_COLOR: Record<BudgetState, string> = {
  ok: 'bg-accent',
  warn: 'bg-amber-500',
  over: 'bg-debt',
}

interface SheetState { categoryId: string; categoryName: string; initialAmount: number | null }

export function BudgetsTab(
  { month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void },
) {
  const txs = useMonthTransactions(month)
  const budgets = useBudgets()
  const categories = useCategories()
  const [sheet, setSheet] = useState<SheetState | null>(null)

  const loading = txs.isLoading || budgets.isLoading || categories.isLoading
  const error = txs.isError || budgets.isError || categories.isError

  const statuses = computeBudgetStatus(txs.data ?? [], budgets.data ?? [], categories.data ?? [])
  const unbudgeted = categoriesWithoutBudget(categories.data ?? [], budgets.data ?? [])

  return (
    <div>
      <MonthNav month={month} onChange={onMonthChange} />

      {loading && <Skeleton className="h-48 w-full mt-4" />}

      {error && (
        <p className="text-debt text-sm mt-4">No se pudieron cargar los presupuestos. Reintentá.</p>
      )}

      {!loading && !error && (
        <>
          {statuses.length === 0 && (
            <p className="text-sm text-muted mt-6">Sin presupuestos. Agregá el primero abajo.</p>
          )}

          <ul className="mt-4">
            {statuses.map((s) => (
              <li key={s.categoryId}>
                <button
                  onClick={() => setSheet({ categoryId: s.categoryId, categoryName: s.categoryName, initialAmount: s.amount })}
                  className="w-full text-left py-3 border-t border-ink-line active:bg-ink-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-zinc-200 flex-1">{s.categoryName}</span>
                    <span className="text-sm text-zinc-400">
                      <MoneyText value={s.spent} className="text-zinc-300" /> / <MoneyText value={s.amount} className="text-muted" />
                    </span>
                    <span className="text-[11px] text-muted w-10 text-right">{Math.round(s.pct * 100)}%</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-ink-2 overflow-hidden">
                    <div className={`h-full ${BAR_COLOR[s.state]}`}
                      style={{ width: `${Math.min(s.pct, 1) * 100}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {unbudgeted.length > 0 && (
            <div className="mt-6">
              <p className="text-[11px] uppercase tracking-[0.12em] text-faint mb-2">agregar presupuesto</p>
              <div className="flex flex-wrap gap-2">
                {unbudgeted.map((c) => (
                  <button key={c.id}
                    onClick={() => setSheet({ categoryId: c.id, categoryName: c.name, initialAmount: null })}
                    className="border border-ink-line rounded-lg px-3 py-1.5 text-sm text-zinc-400 active:scale-[0.98]">
                    + {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <BudgetSheet
        open={sheet !== null}
        categoryId={sheet?.categoryId ?? null}
        categoryName={sheet?.categoryName ?? ''}
        initialAmount={sheet?.initialAmount ?? null}
        onClose={() => setSheet(null)}
      />
    </div>
  )
}
