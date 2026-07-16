export interface ScrollMetrics {
  scrollLeft: number
  scrollWidth: number
  clientWidth: number
}

export interface EdgeFades {
  left: boolean
  right: boolean
}

// 1px absorbe el redondeo sub-pixel del navegador (scrollWidth/clientWidth enteros,
// scrollLeft fraccionario en zoom/retina).
const EPSILON = 1

export function edgeFades({ scrollLeft, scrollWidth, clientWidth }: ScrollMetrics): EdgeFades {
  return {
    left: scrollLeft > EPSILON,
    right: scrollLeft + clientWidth < scrollWidth - EPSILON,
  }
}

const FADE = '24px'

export function maskImageFor({ left, right }: EdgeFades): string | undefined {
  if (left && right) {
    return `linear-gradient(to right, transparent, #000 ${FADE}, #000 calc(100% - ${FADE}), transparent)`
  }
  if (right) return `linear-gradient(to right, #000 calc(100% - ${FADE}), transparent)`
  if (left) return `linear-gradient(to right, transparent, #000 ${FADE})`
  return undefined
}
