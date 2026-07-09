import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { shiftMonth, monthLabel, currentMonthKey } from '../../data/monthNav'
import type { MonthKey } from '../../data/types'

export function MonthNav({ month, onChange }: { month: MonthKey; onChange: (m: MonthKey) => void }) {
  // MonthKey es 'AAAA-MM': comparación lexicográfica de string equivale a orden cronológico.
  const isCurrentOrFutureMonth = month >= currentMonthKey(new Date())

  return (
    <div className="flex items-center justify-between mt-4">
      <button aria-label="Mes anterior" onClick={() => onChange(shiftMonth(month, -1))}
        className="p-2 text-zinc-400 active:scale-[0.95]">
        <CaretLeft size={18} />
      </button>
      <span className="text-sm text-zinc-200">{monthLabel(month)}</span>
      <button aria-label="Mes siguiente" disabled={isCurrentOrFutureMonth}
        onClick={() => onChange(shiftMonth(month, 1))}
        className="p-2 text-zinc-400 active:scale-[0.95] disabled:opacity-30">
        <CaretRight size={18} />
      </button>
    </div>
  )
}
