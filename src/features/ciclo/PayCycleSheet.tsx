import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { usePayCycle } from '../../data/usePayCycle'
import type { BillingCycle } from '../../data/types'

interface Props {
  cycle: BillingCycle | null
  santanderAccountId: string | null
  lastSantanderBalance: number
  onClose: () => void
}

export function PayCycleSheet({ cycle, santanderAccountId, lastSantanderBalance, onClose }: Props) {
  const pay = usePayCycle()
  const proposed = Math.max(0, lastSantanderBalance - (cycle?.billedAmount ?? 0))
  const [saldo, setSaldo] = useState(proposed)

  useEffect(() => {
    setSaldo(proposed)
  }, [cycle?.id, lastSantanderBalance])

  function submit() {
    if (!cycle || !santanderAccountId) return
    pay.mutate(
      { cycleId: cycle.id, santanderAccountId, nuevoSaldo: saldo },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={!!cycle} title="Marcar pagada — nuevo saldo Santander" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-xs text-muted">
          Propuesto: último saldo − boleta. El SLRD no cambia al pagar (esa deuda ya la debías).
        </p>
        <MoneyText value={saldo} className="text-3xl text-zinc-50" />
        <NumberPad value={saldo} onChange={setSaldo} />
        {pay.isError && <p className="text-debt text-sm">No se pudo registrar el pago. Reintentá.</p>}
        <button onClick={submit} disabled={pay.isPending || !santanderAccountId}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {pay.isPending ? 'Registrando…' : 'Confirmar pago'}
        </button>
      </div>
    </BottomSheet>
  )
}
