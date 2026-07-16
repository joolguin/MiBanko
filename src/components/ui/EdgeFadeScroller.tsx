import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { edgeFades, maskImageFor, type EdgeFades } from './edgeFades'

// Envuelve una fila horizontal, la hace scrolleable sin barra visible y atenúa
// (mask-image) solo los bordes donde hay contenido oculto, como indicio de scroll.
export function EdgeFadeScroller({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fades, setFades] = useState<EdgeFades>({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setFades(edgeFades({
      scrollLeft: el.scrollLeft,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }))
  }, [])

  useLayoutEffect(measure, [measure])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.addEventListener('scroll', measure, { passive: true })
    let ro: ResizeObserver | undefined
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      if (el.firstElementChild) ro.observe(el.firstElementChild)
    }
    return () => {
      el.removeEventListener('scroll', measure)
      ro?.disconnect()
    }
  }, [measure])

  const mask = maskImageFor(fades)

  return (
    <div
      ref={ref}
      data-testid="edge-fade-scroller"
      className={`overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ''}`}
      style={mask ? { WebkitMaskImage: mask, maskImage: mask } : undefined}
    >
      {children}
    </div>
  )
}
