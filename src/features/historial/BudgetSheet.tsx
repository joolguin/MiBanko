import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'

interface Props {
  open: boolean
  categoryId: string | null
  categoryName: string
  initialAmount: number | null
  onClose: () => void
}

export function BudgetSheet({ open, categoryId, categoryName, initialAmount, onClose }: Props) {
  const save = useSaveBudget()
  const del = useDeleteBudget()
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    if (!open) return
    setAmount(initialAmount ?? 0)
  }, [open, initialAmount])

  const canSave = amount > 0 && !!categoryId && !save.isPending
  const isEditing = initialAmount !== null

  function submit() {
    if (!categoryId) return
    save.mutate({ categoryId, amount }, { onSuccess: onClose })
  }

  function remove() {
    if (!categoryId) return
    del.mutate(categoryId, { onSuccess: onClose })
  }

  return (
    <BottomSheet open={open} title={`Presupuesto de ${categoryName}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-1">monto mensual</p>
          <MoneyText value={amount} className="text-3xl text-zinc-50" />
        </div>

        <NumberPad value={amount} onChange={setAmount} />

        {(save.isError || del.isError) && (
          <p className="text-debt text-sm">No se pudo guardar. Reintentá.</p>
        )}

        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>

        {isEditing && (
          <button onClick={remove} disabled={del.isPending}
            className="text-debt text-sm py-2 active:scale-[0.98] transition-transform disabled:opacity-40">
            {del.isPending ? 'Borrando…' : 'Borrar presupuesto'}
          </button>
        )}
      </div>
    </BottomSheet>
  )
}
