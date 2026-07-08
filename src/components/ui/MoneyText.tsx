import { formatCLP, formatSignedCLP } from '../../lib/format'

interface Props { value: number; signed?: boolean; className?: string }

export function MoneyText({ value, signed, className }: Props) {
  return (
    <span className={`font-mono tabular-nums ${className ?? ''}`}>
      {signed ? formatSignedCLP(value) : formatCLP(value)}
    </span>
  )
}
