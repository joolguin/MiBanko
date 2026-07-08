import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { useCloseCycle } from '../../data/useCloseCycle'
import { deriveCycleDates } from '../../data/cycleDates'
import type { BiceConfig, CloseCycleResult } from '../../data/types'

interface Props {
  open: boolean
  config: BiceConfig
  onClose: () => void
  onClosed: (r: CloseCycleResult) => void
}

export function CloseCycleSheet({ open, config, onClose, onClosed }: Props) {
  const close = useCloseCycle()
  const [billed, setBilled] = useState(0)

  useEffect(() => {
    if (open) setBilled(0)
  }, [open])

  function submit() {
    const dates = deriveCycleDates(config, new Date())
    close?.mutate({ billedAmount: billed, dates }, { onSuccess: (r) => { onClosed(r); onClose() } })
  }

  return (
    <BottomSheet open={open} title="Cerrar ciclo — monto de la boleta" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <MoneyText value={billed} className="text-3xl text-zinc-50" />
        <NumberPad value={billed} onChange={setBilled} />
        {close?.isError && <p className="text-debt text-sm">No se pudo cerrar. Reintentá.</p>}
        <button onClick={submit} disabled={billed <= 0 || close?.isPending}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {close?.isPending ? 'Cerrando…' : 'Cerrar ciclo'}
        </button>
      </div>
    </BottomSheet>
  )
}
