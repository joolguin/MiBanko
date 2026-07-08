import { useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { useSaveBiceConfig } from '../../data/useBiceConfig'
import type { BiceConfig } from '../../data/types'

interface Props { open: boolean; initial: BiceConfig | null; onClose: () => void }

export function BiceConfigSheet({ open, initial, onClose }: Props) {
  const save = useSaveBiceConfig()
  const [closingDay, setClosingDay] = useState(String(initial?.closingDay ?? ''))
  const [dueDay, setDueDay] = useState(String(initial?.dueDay ?? ''))

  function clamp(s: string): number { return Math.min(28, Math.max(1, Number(s) || 1)) }
  function submit() {
    save?.mutate({ closingDay: clamp(closingDay), dueDay: clamp(dueDay) }, { onSuccess: onClose })
  }

  return (
    <BottomSheet open={open} title="Fechas de BICE" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Día de corte (1–28)
          <input inputMode="numeric" value={closingDay} onChange={(e) => setClosingDay(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent font-mono" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-zinc-400">
          Día de vencimiento (1–28)
          <input inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value)}
            className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent font-mono" />
        </label>
        {save?.isError && <p className="text-debt text-sm">No se pudo guardar.</p>}
        <button onClick={submit} disabled={save?.isPending || !closingDay || !dueDay}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save?.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
