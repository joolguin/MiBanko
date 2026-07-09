import type { CategorySpendSegment } from './types'

export interface DonutDash {
  label: string
  pct: number
  dash: number
  offset: number
}

export function donutDashes(
  segments: CategorySpendSegment[],
  circumference: number,
): DonutDash[] {
  let cumulativePct = 0
  return segments.map((s) => {
    const dash = (s.pct / 100) * circumference
    const offset = -((cumulativePct / 100) * circumference)
    cumulativePct += s.pct
    return { label: s.label, pct: s.pct, dash, offset }
  })
}
