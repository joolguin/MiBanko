import { useMonthTransactions } from '../../data/useMonthTransactions'
import { computeCategorySpend } from '../../data/categorySpend'
import { MonthNav } from './MonthNav'
import { CategoryDonut, segmentColor } from './CategoryDonut'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import type { MonthKey } from '../../data/types'

export function CategorySpendTab(
  { month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void },
) {
  const txs = useMonthTransactions(month)
  const segments = computeCategorySpend(txs.data ?? [])

  return (
    <div>
      <MonthNav month={month} onChange={onMonthChange} />

      {txs.isLoading && <Skeleton className="h-48 w-full mt-4" />}

      {txs.isError && (
        <div className="mt-4">
          <p className="text-debt text-sm">No se pudo cargar el gasto. Reintentá.</p>
          <button onClick={() => txs.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">
            Reintentar
          </button>
        </div>
      )}

      {!txs.isLoading && !txs.isError && segments.length === 0 && (
        <p className="text-sm text-muted mt-6">Sin gastos este mes.</p>
      )}

      {!txs.isLoading && !txs.isError && segments.length > 0 && (
        <>
          <CategoryDonut segments={segments} />
          <ul className="mt-4">
            {segments.map((s, i) => (
              <li key={s.label} className="flex items-center gap-2 py-2 border-t border-ink-line">
                <span className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: segmentColor(s.isOther, i) }} />
                <span className="text-sm text-zinc-200 flex-1">{s.label}</span>
                <MoneyText value={s.amount} className="text-sm text-zinc-300" />
                <span className="text-[11px] text-muted w-10 text-right">{Math.round(s.pct)}%</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
