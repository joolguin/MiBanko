import { CaretDown } from '@phosphor-icons/react'

interface Props { label: string; onClick: () => void; falta?: boolean }

// Distinto de Chip a propósito: Chip es un toggle (uno activo entre varios, como
// en SubscriptionSheet); Picker abre un BottomSheet y muestra el valor actual.
// min-h-11 son los 44px de WCAG 2.5.5: acá no sirve el ::after invisible del nav
// porque las filas de selectores quedan a 42px y las áreas se solaparían.
export function Picker({ label, onClick, falta }: Props) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 min-h-11 px-4 rounded-full text-sm border transition-colors active:scale-[0.98] ${
        falta ? 'border-dashed border-accent text-accent-bright' : 'border-ink-line bg-ink-2 text-zinc-200'
      }`}>
      {label}
      <CaretDown size={12} weight="bold" className="text-zinc-500" aria-hidden="true" />
    </button>
  )
}
