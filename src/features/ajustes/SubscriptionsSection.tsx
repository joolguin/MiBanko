import { useState } from 'react'
import { MoneyText } from '../../components/ui/MoneyText'
import { Skeleton } from '../../components/ui/Skeleton'
import { Plus, Trash } from '@phosphor-icons/react'
import {
  useSubscriptions, useToggleSubscription, useDeleteSubscription,
} from '../../data/useSubscriptions'
import { SubscriptionSheet } from './SubscriptionSheet'
import type { Subscription } from '../../data/types'

export function SubscriptionsSection() {
  const subs = useSubscriptions()
  const toggle = useToggleSubscription()
  const del = useDeleteSubscription()
  const [editing, setEditing] = useState<Subscription | null | 'new'>(null)

  return (
    <section>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">suscripciones fijas</p>
        <button onClick={() => setEditing('new')} aria-label="Agregar suscripción"
          className="flex items-center gap-1 text-sm text-accent-bright active:scale-[0.98]">
          <Plus size={16} weight="bold" /> Agregar
        </button>
      </div>

      {subs.isLoading && <Skeleton className="h-16 w-full mt-3" />}

      {subs.isError && (
        <div className="mt-3">
          <p className="text-debt text-sm">No se pudieron cargar. Reintentá.</p>
          <button onClick={() => subs.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">Reintentar</button>
        </div>
      )}

      {subs.data && subs.data.length === 0 && (
        <p className="text-sm text-zinc-500 mt-3">No tenés suscripciones. Agregá la primera.</p>
      )}

      <div className="mt-2">
        {(subs.data ?? []).map((s) => (
          <div key={s.id} className={`py-3 border-t border-ink-line flex items-center justify-between ${s.isActive ? '' : 'opacity-45'}`}>
            <button onClick={() => setEditing(s)} className="text-left flex flex-col gap-0.5">
              <span className="text-sm text-zinc-200">{s.name}</span>
              <span className="text-[11px] text-zinc-500">día {s.chargeDayOfMonth}{s.isActive ? '' : ' · pausada'}</span>
            </button>
            <div className="flex items-center gap-3">
              <MoneyText value={s.amount} className="text-sm text-zinc-300" />
              <button onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}
                className="text-[11px] text-zinc-400 border border-ink-line rounded-full px-2.5 py-1 active:scale-[0.98]">
                {s.isActive ? 'Pausar' : 'Activar'}
              </button>
              <button onClick={() => del.mutate(s.id)} aria-label={`Borrar ${s.name}`}
                className="text-zinc-500 active:scale-[0.9]">
                <Trash size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <SubscriptionSheet
        open={editing !== null}
        initial={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
      />
    </section>
  )
}
