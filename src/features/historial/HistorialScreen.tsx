import { useState } from 'react'
import { SlrdTab } from './SlrdTab'
import { CategorySpendTab } from './CategorySpendTab'
import { BudgetsTab } from './BudgetsTab'
import { TransactionsTab } from './TransactionsTab'
import { currentMonthKey } from '../../data/monthNav'
import { EdgeFadeScroller } from '../../components/ui/EdgeFadeScroller'
import { Chip } from '../../components/ui/Chip'
import type { MonthKey } from '../../data/types'

type SubTab = 'slrd' | 'gasto' | 'presupuestos' | 'movimientos'
const TABS: { value: SubTab; label: string }[] = [
  { value: 'slrd', label: 'SLRD' },
  { value: 'gasto', label: 'Gasto' },
  { value: 'presupuestos', label: 'Presupuestos' },
  { value: 'movimientos', label: 'Movimientos' },
]

export function HistorialScreen() {
  const [tab, setTab] = useState<SubTab>('slrd')
  const [month, setMonth] = useState<MonthKey>(() => currentMonthKey(new Date()))

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-faint">historial</p>

      <EdgeFadeScroller className="mt-3">
        <div className="flex gap-2 w-max">
          {TABS.map((t) => (
            <Chip key={t.value} variant="tab" label={t.label}
              active={tab === t.value} onClick={() => setTab(t.value)} />
          ))}
        </div>
      </EdgeFadeScroller>

      {tab === 'slrd' && <SlrdTab />}
      {tab === 'gasto' && <CategorySpendTab month={month} onMonthChange={setMonth} />}
      {tab === 'presupuestos' && <BudgetsTab month={month} onMonthChange={setMonth} />}
      {tab === 'movimientos' && <TransactionsTab month={month} onMonthChange={setMonth} />}
    </section>
  )
}
