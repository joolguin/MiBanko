import { useState } from 'react'
import { useUnpaidCycles, usePaidCycles } from '../../data/useUnpaidCycles'
import { useAccounts } from '../../data/useAccounts'
import { useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'
import { MoneyText } from '../../components/ui/MoneyText'
import { PayCycleSheet } from './PayCycleSheet'
import { formatShortDate } from '../../lib/format'
import { daysUntil, dueDistanceLabel } from '../../data/dueDates'
import { santiagoToday } from '../../data/santiagoDate'
import type { BillingCycle } from '../../data/types'

const DUE_WARN_DAYS = 2

export function UnpaidCyclesSection() {
  const unpaid = useUnpaidCycles()
  const paid = usePaidCycles()
  const accounts = useAccounts()
  const latest = useLatestSnapshotsByAccount()
  const [paying, setPaying] = useState<BillingCycle | null>(null)

  const santander = (accounts.data ?? []).find((a) => a.type === 'debit')
  const lastBalance = santander ? latest.data?.[santander.id]?.balance ?? 0 : 0

  return (
    <div className="mt-8">
      <p className="text-[11px] uppercase tracking-[0.12em] text-faint mb-1">facturado — pendiente de pago</p>
      {(unpaid.data ?? []).length === 0 && (
        <p className="text-sm text-muted mt-2">Sin ciclos pendientes.</p>
      )}
      {(unpaid.data ?? []).map((c) => {
        // La app hace la resta de días, no Josefa; con <=2 días la coletilla pasa a ámbar.
        const days = daysUntil(c.dueDate, santiagoToday(new Date()))
        return (
        <div key={c.id} className="py-3.5 border-t border-ink-line flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <MoneyText value={c.billedAmount} className="text-[15px] text-zinc-100" />
            <span className="text-[11px] text-muted">
              {days < 0 ? 'venció' : 'vence'} {formatShortDate(c.dueDate)} ·{' '}
              <span className={days <= DUE_WARN_DAYS ? 'text-[var(--fresh-warn)]' : ''}>
                {dueDistanceLabel(days)}
              </span>
            </span>
          </div>
          <button onClick={() => setPaying(c)}
            className="border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Marcar pagada</button>
        </div>
        )
      })}

      {(paid.data ?? []).length > 0 && (
        <details className="mt-6">
          <summary className="text-[11px] uppercase tracking-[0.12em] text-faint cursor-pointer">pagados</summary>
          {(paid.data ?? []).map((c) => (
            <div key={c.id} className="py-3 border-t border-ink-line flex items-center justify-between">
              <span className="text-[11px] text-faint">vencía {formatShortDate(c.dueDate)}</span>
              <MoneyText value={c.billedAmount} className="text-sm text-muted" />
            </div>
          ))}
        </details>
      )}

      <PayCycleSheet
        cycle={paying}
        santanderAccountId={santander?.id ?? null}
        lastSantanderBalance={lastBalance}
        onClose={() => setPaying(null)}
      />
    </div>
  )
}
