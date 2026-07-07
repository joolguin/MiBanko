import type { ReactNode } from 'react'

interface Props { label: string; active?: boolean; onClick?: () => void; icon?: ReactNode }

export function Chip({ label, active, onClick, icon }: Props) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors active:scale-[0.98] ${
        active ? 'border-accent text-accent-bright bg-accent/10' : 'border-ink-line text-zinc-300'
      }`}>
      {icon}
      {label}
    </button>
  )
}
