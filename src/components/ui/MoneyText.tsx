import { formatCLP, formatSignedCLP } from '../../lib/format'

interface Props { value: number; signed?: boolean; withPlus?: boolean; className?: string }

export function MoneyText({ value, signed, withPlus, className }: Props) {
  return (
    <span className={`font-mono tabular-nums ${className ?? ''}`}>
      {signed ? formatSignedCLP(value, withPlus) : formatCLP(value)}
    </span>
  )
}
