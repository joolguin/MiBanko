import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { useSaveCategory } from '../../data/useCategories'
import type { Category } from '../../data/types'

interface Props { open: boolean; initial: Category | null; onClose: () => void }

export function CategorySheet({ open, initial, onClose }: Props) {
  const save = useSaveCategory()
  const [name, setName] = useState('')

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
  }, [open, initial])

  const canSave = name.trim().length > 0 && !save.isPending

  function submit() {
    save.mutate(
      { ...(initial ? { id: initial.id } : {}), name: name.trim() },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={open} title={initial ? 'Editar categoría' : 'Nueva categoría'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Comida)"
          className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />
        {save.isError && <p className="text-debt text-sm">Ya existe una categoría con ese nombre.</p>}
        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
