import { donutDashes } from '../../data/donutGeometry'
import type { CategorySpendSegment } from '../../data/types'

// Paleta categórica validada con dataviz sobre la superficie oscura de la app (#0c0c0e).
// El WARN de CVD en banda-piso se mitiga con la leyenda (direct labels) en CategorySpendTab.
export const SEGMENT_COLORS = ['#3987e5', '#199e70', '#c98500', '#008300', '#9085e9', '#e66767']
export const OTHER_COLOR = '#52525b'

export function segmentColor(isOther: boolean, index: number): string {
  if (isOther) return OTHER_COLOR
  return SEGMENT_COLORS[index % SEGMENT_COLORS.length]
}

const SIZE = 140
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CENTER = SIZE / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function CategoryDonut({ segments }: { segments: CategorySpendSegment[] }) {
  const dashes = donutDashes(segments, CIRCUMFERENCE)

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-40 h-40 mx-auto mt-4"
      role="img" aria-label="Gasto por categoría">
      <g transform={`rotate(-90 ${CENTER} ${CENTER})`}>
        {dashes.map((d, i) => (
          <circle
            key={d.label}
            data-arc
            cx={CENTER} cy={CENTER} r={RADIUS}
            fill="none"
            stroke={segmentColor(segments[i].isOther, i)}
            strokeWidth={STROKE}
            strokeDasharray={`${d.dash} ${CIRCUMFERENCE}`}
            strokeDashoffset={d.offset}
          />
        ))}
      </g>
    </svg>
  )
}
