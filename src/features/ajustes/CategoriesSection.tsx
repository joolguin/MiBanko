import { useState } from 'react'
import { Skeleton } from '../../components/ui/Skeleton'
import { Plus, Trash } from '@phosphor-icons/react'
import { useCategories, useDeleteCategory } from '../../data/useCategories'
import { CategorySheet } from './CategorySheet'
import type { Category } from '../../data/types'

export function CategoriesSection() {
  const cats = useCategories()
  const del = useDeleteCategory()
  const [editing, setEditing] = useState<Category | null | 'new'>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-faint">categorías</p>
        <button onClick={() => setEditing('new')} aria-label="Agregar categoría"
          className="flex items-center gap-1 text-sm text-accent-bright active:scale-[0.98]">
          <Plus size={16} weight="bold" /> Agregar
        </button>
      </div>

      {cats.isLoading && <Skeleton className="h-16 w-full mt-3" />}

      {cats.isError && (
        <div className="mt-3">
          <p className="text-debt text-sm">No se pudieron cargar. Reintentá.</p>
          <button onClick={() => cats.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Reintentar</button>
        </div>
      )}

      {del.isError && <p className="text-debt text-sm mt-3">No se pudo borrar. Reintentá.</p>}

      {cats.data && cats.data.length === 0 && (
        <p className="text-sm text-muted mt-3">No tenés categorías. Agregá la primera.</p>
      )}

      <div className="mt-2">
        {(cats.data ?? []).map((c) => (
          <div key={c.id} className="py-3 border-t border-ink-line flex items-center justify-between">
            <button onClick={() => setEditing(c)} className="text-left text-sm text-zinc-200">{c.name}</button>
            {confirmingId === c.id ? (
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-zinc-400">¿Borrar?</span>
                <button onClick={() => { del.mutate(c.id); setConfirmingId(null) }}
                  className="text-debt active:scale-[0.98]">Sí</button>
                <button onClick={() => setConfirmingId(null)}
                  className="text-zinc-400 active:scale-[0.98]">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmingId(c.id)} aria-label={`Borrar ${c.name}`}
                className="text-muted active:scale-[0.9]">
                <Trash size={16} />
              </button>
            )}
          </div>
        ))}
      </div>

      <CategorySheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}
