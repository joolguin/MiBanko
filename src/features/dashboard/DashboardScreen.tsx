import { useNavigate } from 'react-router-dom'
import { useSlrd } from '../../data/useSlrd'
import { useLatestSnapshotAge } from '../../data/useLatestSnapshotAge'
import { useUserSettings, DEFAULT_FRESH_LIMIT_DAYS } from '../../data/useUserSettings'
import { isStale } from '../../data/freshness'
import { CountUp } from '../../components/motion/CountUp'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { WarningCircle } from '@phosphor-icons/react'

export function DashboardScreen() {
  const nav = useNavigate()
  const slrd = useSlrd()
  const age = useLatestSnapshotAge()
  const settings = useUserSettings()
  const limit = settings.data?.freshLimitDays ?? DEFAULT_FRESH_LIMIT_DAYS
  const stale = isStale(age.data ?? null, limit)

  if (slrd.isLoading) {
    return (
      <section className="px-6 pt-10">
        <Skeleton className="h-3 w-32 mb-4" />
        <div data-testid="slrd-skeleton"><Skeleton className="h-14 w-56 mb-3" /></div>
        <Skeleton className="h-4 w-40" />
      </section>
    )
  }

  if (slrd.isError || !slrd.data) {
    return (
      <section className="px-6 pt-10">
        <p className="text-debt text-sm">No pudimos cargar tu saldo. Reintentá.</p>
        <button onClick={() => slrd.refetch()}
          className="mt-3 border border-ink-line rounded-lg px-4 py-2 text-sm active:scale-[0.98]">
          Reintentar
        </button>
      </section>
    )
  }

  const d = slrd.data
  const sinDatos = d.saldoDebito === 0 && d.saldoInversion === 0

  return (
    <section className="px-6 pt-8">
      <header className="flex items-center justify-between">
        <span className="text-[15px] text-zinc-400">Hola, Josefa</span>
        {age.data != null && (
          <span className={`text-[11px] px-2.5 py-1 ${stale
            ? 'text-[var(--fresh-warn)] border border-ink-line rounded-full'
            : 'text-muted'}`}>
            {stale ? `snapshot hace ${age.data} días` : `hace ${age.data} días`}
          </span>
        )}
      </header>

      {stale && (
        <button onClick={() => nav('/snapshots')}
          className="mt-4 w-full text-left bg-ink-2 border border-ink-line rounded-xl px-4 py-3 flex items-center justify-between active:scale-[0.99]">
          <span className="text-sm text-zinc-300">Tu SLRD puede estar desactualizado — actualizá tus saldos</span>
          <span className="text-accent-bright text-sm">Actualizar</span>
        </button>
      )}

      {sinDatos ? (
        <div className="mt-16 text-center">
          <p className="text-lg mb-1">Todavía no hay saldos.</p>
          <p className="text-sm text-muted">Cargá tu primer snapshot para ver el SLRD real.</p>
        </div>
      ) : (
        <>
          <div className="mt-8">
            <p className="text-[11px] uppercase tracking-[0.14em] text-faint">disponible de verdad</p>
            <CountUp value={d.slrdInmediato}
              className={`block text-[46px] leading-none mt-1.5 ${stale ? 'text-muted' : 'text-accent-bright'}`} />
            {stale && <p className="text-[11px] text-[var(--fresh-warn)] mt-1">estimado · snapshot viejo</p>}
            <div className="flex items-baseline gap-2 mt-2.5">
              <MoneyText value={d.saldoContable} className="text-base text-faint line-through decoration-debt" />
              <span className="text-xs text-faint">lo que el banco te muestra</span>
            </div>
          </div>

          <div className="mt-6 py-3.5 border-t border-ink-line flex items-baseline justify-between">
            <span className="text-sm text-zinc-400">Con Fintual <span className="text-faint">(total)</span></span>
            <MoneyText value={d.slrdTotal} className="text-[17px] text-zinc-200" />
          </div>

          <div className="mt-4">
            <p className="text-[11px] uppercase tracking-[0.12em] text-faint mb-1">deuda comprometida</p>
            <Row label="Facturado BICE" hint="pendiente de pago" amount={d.deudaFacturada} />
            <Row label="Ciclo actual" hint="sin facturar" amount={d.deudaNoFacturada} />
          </div>
        </>
      )}
    </section>
  )
}

function Row({ label, hint, amount }: { label: string; hint: string; amount: number }) {
  return (
    <div className="py-3.5 border-t border-ink-line flex items-center justify-between">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm text-zinc-200">{label}</span>
        <span className="text-[11px] text-muted flex items-center gap-1">
          <WarningCircle size={12} className="text-[var(--fresh-warn)]" />{hint}
        </span>
      </div>
      <MoneyText value={-amount} signed className="text-[15px] text-debt" />
    </div>
  )
}
