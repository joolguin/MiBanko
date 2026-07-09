import { useState } from 'react'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import { filterByRange, type ChartRange } from '../../data/chartScale'
import { SlrdLineChart } from './SlrdLineChart'
import { Skeleton } from '../../components/ui/Skeleton'

const MIN_POINTS_FOR_CHART = 2
const RANGES: { value: ChartRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'Todo' },
]

export function HistorialScreen() {
  const history = useSlrdHistory()
  const [range, setRange] = useState<ChartRange>('30d')

  const points = history.data ?? []
  const visible = filterByRange(points, range, new Date())

  return (
    <section className="px-6 pt-8">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">historial del slrd</p>

      {history.isLoading && <Skeleton className="h-48 w-full mt-4" />}

      {history.isError && (
        <div className="mt-4">
          <p className="text-debt text-sm">No se pudo cargar el historial. Reintentá.</p>
          <button onClick={() => history.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">
            Reintentar
          </button>
        </div>
      )}

      {!history.isLoading && !history.isError && points.length < MIN_POINTS_FOR_CHART && (
        <p className="text-sm text-zinc-500 mt-4">
          El historial se arma solo: guardamos el SLRD de cada día. Volvé mañana para ver la tendencia.
        </p>
      )}

      {!history.isLoading && !history.isError && points.length >= MIN_POINTS_FOR_CHART && (
        <>
          <div className="flex gap-2 mt-4">
            {RANGES.map((r) => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={`rounded-lg px-3 py-1.5 text-sm active:scale-[0.98] ${
                  range === r.value ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
                }`}>
                {r.label}
              </button>
            ))}
          </div>
          {visible.length >= MIN_POINTS_FOR_CHART ? (
            <SlrdLineChart points={visible} />
          ) : (
            <p className="text-sm text-zinc-500 mt-4">Sin datos en este rango.</p>
          )}
        </>
      )}
    </section>
  )
}
