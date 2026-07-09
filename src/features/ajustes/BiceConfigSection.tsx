import { useState } from 'react'
import { BiceConfigSheet } from '../../components/BiceConfigSheet'
import { useBiceConfig } from '../../data/useBiceConfig'

export function BiceConfigSection() {
  const config = useBiceConfig()
  const [open, setOpen] = useState(false)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">ciclo bice</p>
        <button onClick={() => setOpen(true)} className="text-sm text-accent-bright active:scale-[0.98]">Editar</button>
      </div>
      <p className="text-sm text-zinc-300 mt-3">
        {config.data
          ? `Corte día ${config.data.closingDay} · Vence día ${config.data.dueDay}`
          : 'Sin configurar'}
      </p>
      <BiceConfigSheet open={open} initial={config.data ?? null} onClose={() => setOpen(false)} />
    </section>
  )
}
