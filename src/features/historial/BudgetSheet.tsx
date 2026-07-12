import { useEffect, useMemo, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { useSaveBudget, useDeleteBudget } from '../../data/useBudgets'
import { useCategoryAverages } from '../../data/useCategoryAverages'
import { computeCategoryAverages } from '../../data/categoryAverages'

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
  const [windowMonths, setWindowMonths] = useState<3 | 6>(3)
  const { rows, monthKeys } = useCategoryAverages()
  const suggestion = useMemo(() => {
    if (!categoryId) return undefined
    const averages = computeCategoryAverages(rows, windowMonths, monthKeys.slice(-windowMonths))
    return averages.get(categoryId)
  }, [rows, monthKeys, windowMonths, categoryId])

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

        {suggestion && (
          <div>
            <div className="flex gap-2 mb-2">
              {([3, 6] as const).map((w) => (
                <button key={w} type="button" onClick={() => setWindowMonths(w)}
                  className={`rounded-lg px-3 py-1 text-xs active:scale-[0.98] ${
                    windowMonths === w ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'
                  }`}>
                  {w} meses
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAmount(Math.round(suggestion.avg))}
              className="w-full text-left border border-ink-line rounded-lg px-3 py-2 active:scale-[0.98]">
              <span className="text-sm text-zinc-400">Promedio: </span>
              <MoneyText value={suggestion.avg} className="text-sm text-zinc-100" />
              {suggestion.monthsCounted < windowMonths && (
                <span className="text-[11px] text-zinc-500 ml-2">
                  promedio de {suggestion.monthsCounted} {suggestion.monthsCounted === 1 ? 'mes' : 'meses'}
                </span>
              )}
            </button>
          </div>
        )}

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
