import { useState } from 'react'
import { useSlrdHistory } from '../../data/useSlrdHistory'
import { filterByRange, type ChartRange } from '../../data/chartScale'
import { SlrdLineChart } from './SlrdLineChart'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import { Chip } from '../../components/ui/Chip'

const MIN_POINTS_FOR_CHART = 2
const RANGES: { value: ChartRange; label: string }[] = [
  { value: '30d', label: '30d' },
  { value: '90d', label: '90d' },
  { value: 'all', label: 'Todo' },
]

export function SlrdTab() {
  const history = useSlrdHistory()
  const [range, setRange] = useState<ChartRange>('30d')

  const points = history.data ?? []
  const visible = filterByRange(points, range, new Date())

  return (
    <div>
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
        <div className="mt-4">
          <p className="text-sm text-muted">
            El historial se arma solo: guardamos el SLRD de cada día. Volvé mañana para ver la tendencia.
          </p>
          {points.length === 1 && (
            <p className="text-sm text-zinc-400 mt-2">
              SLRD de hoy: <MoneyText value={points[0].slrdInmediato} />
            </p>
          )}
        </div>
      )}

      {!history.isLoading && !history.isError && points.length >= MIN_POINTS_FOR_CHART && (
        <>
          <div className="flex gap-2 mt-4">
            {RANGES.map((r) => (
              <Chip key={r.value} variant="tab" label={r.label}
                active={range === r.value} onClick={() => setRange(r.value)} />
            ))}
          </div>
          {visible.length >= MIN_POINTS_FOR_CHART ? (
            <SlrdLineChart points={visible} />
          ) : (
            <p className="text-sm text-muted mt-4">Sin datos en este rango.</p>
          )}
        </>
      )}
    </div>
  )
}
