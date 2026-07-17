import type { ReactNode } from 'react'

type Variant = 'filter' | 'tab'

interface Props { label: string; active?: boolean; onClick?: () => void; icon?: ReactNode; variant?: Variant }

// Dos variantes semánticas: 'tab' para selección exclusiva (relleno sólido, siempre
// hay exactamente una activa) y 'filter' para toggles acumulables (borde, puede
// haber varias activas o ninguna).
const STYLES: Record<Variant, { on: string; off: string }> = {
  filter: { on: 'border-accent text-accent-bright bg-accent/10', off: 'border-ink-line text-zinc-300' },
  tab: { on: 'border-transparent bg-accent text-accent-deep', off: 'border-ink-line text-zinc-400' },
}

export function Chip({ label, active, onClick, icon, variant = 'filter' }: Props) {
  return (
    <button type="button" onClick={onClick}
      // El ::after extiende el área de tap a >=44px sin tocar el layout visual.
      className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors active:scale-[0.98] after:absolute after:inset-x-0 after:-inset-y-1.5 after:content-[''] ${
        STYLES[variant][active ? 'on' : 'off']
      }`}>
      {icon}
      {label}
    </button>
  )
}
