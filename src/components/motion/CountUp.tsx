import { memo, useEffect } from 'react'
import { animate, useMotionValue, useTransform, motion } from 'framer-motion'
import { formatCLP } from '../../lib/format'

interface Props { value: number; className?: string }

// Aislado y memoizado: la animación corre fuera del ciclo de render de React.
export const CountUp = memo(function CountUp({ value, className }: Props) {
  const mv = useMotionValue(value)
  const text = useTransform(mv, (v) => formatCLP(v))
  useEffect(() => {
    const controls = animate(mv, value, { type: 'spring', stiffness: 90, damping: 20 })
    return controls.stop
  }, [value, mv])
  return <motion.span className={`font-mono tabular-nums ${className ?? ''}`}>{text}</motion.span>
})
