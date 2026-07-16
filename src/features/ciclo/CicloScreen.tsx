import { useState } from 'react'
import { useCurrentCycleTransactions } from '../../data/useCurrentCycle'
import { useBiceConfig } from '../../data/useBiceConfig'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { BiceConfigSheet } from '../../components/BiceConfigSheet'
import { CloseCycleSheet } from './CloseCycleSheet'
import { UnpaidCyclesSection } from './UnpaidCyclesSection'
import type { CloseCycleResult } from '../../data/types'

export function CicloScreen() {
  const current = useCurrentCycleTransactions()
  const config = useBiceConfig()
  const [sheet, setSheet] = useState<null | 'config' | 'close'>(null)
  const [diff, setDiff] = useState<CloseCycleResult | null>(null)

  const hasConfig = !!config.data

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-faint">ciclo actual — sin facturar</p>

      {current.isLoading ? (
        <Skeleton className="h-8 w-40 mt-2" />
      ) : (
        <div className="flex items-baseline justify-between mt-1">
          <span className="text-sm text-muted">{current.data?.items.length ?? 0} gastos</span>
          <MoneyText value={current.data?.total ?? 0} className="text-2xl text-zinc-50" />
        </div>
      )}

      <div className="mt-4">
        {(current.data?.items ?? []).map((t) => (
          <div key={t.id} className="py-3 border-t border-ink-line flex justify-between items-center">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm text-zinc-200">{t.description ?? t.categoryName ?? 'Gasto'}</span>
              <span className="text-[11px] text-muted">{t.categoryName ?? 'Sin categoría'}</span>
            </div>
            <MoneyText value={t.amount} className="text-sm text-zinc-300" />
          </div>
        ))}
        {current.data && current.data.items.length === 0 && (
          <p className="text-sm text-muted mt-2">Nada por facturar aún.</p>
        )}
      </div>

      {diff && diff.diferencia !== 0 && (
        <div className="mt-4 p-3 rounded-lg border border-[var(--fresh-warn)]/40">
          <p className="text-sm text-[var(--fresh-warn)]">
            Boleta <MoneyText value={diff.billedAmount} className="text-[var(--fresh-warn)]" /> vs registrado <MoneyText value={diff.sumaLedger} className="text-[var(--fresh-warn)]" /> → <MoneyText value={diff.diferencia} signed className="text-[var(--fresh-warn)]" /> sin identificar.
          </p>
        </div>
      )}

      {!hasConfig && !config.isLoading && (
        <p className="text-sm text-muted mt-4">Configurá las fechas de BICE para poder cerrar el ciclo.</p>
      )}

      <div className="flex gap-2 mt-5">
        <button onClick={() => setSheet('config')}
          className="border border-ink-line rounded-lg px-4 py-2.5 text-sm active:scale-[0.98]">Fechas BICE</button>
        <button onClick={() => setSheet(hasConfig ? 'close' : 'config')}
          className="flex-1 bg-accent text-accent-deep font-medium rounded-lg py-2.5 active:scale-[0.98] disabled:opacity-40">
          Cerrar ciclo
        </button>
      </div>

      <UnpaidCyclesSection />

      <BiceConfigSheet open={sheet === 'config'} initial={config.data ?? null} onClose={() => setSheet(null)} />
      {hasConfig && (
        <CloseCycleSheet open={sheet === 'close'} config={config.data!} onClose={() => setSheet(null)} onClosed={setDiff} />
      )}
    </section>
  )
}
