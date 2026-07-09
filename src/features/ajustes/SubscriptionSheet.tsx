import { useEffect, useState } from 'react'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import { Chip } from '../../components/ui/Chip'
import { useSaveSubscription } from '../../data/useSubscriptions'
import { useCategories } from '../../data/useCategories'
import type { Channel, Subscription } from '../../data/types'

const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'wallet_pixel', label: 'Wallet Pixel' },
  { id: 'tarjeta_fisica', label: 'Tarjeta física' },
  { id: 'onepay', label: 'Onepay' },
  { id: 'transferencia_app', label: 'Transferencia' },
  { id: 'otro', label: 'Otro' },
]

interface Props { open: boolean; initial: Subscription | null; onClose: () => void }

export function SubscriptionSheet({ open, initial, onClose }: Props) {
  const save = useSaveSubscription()
  const categories = useCategories()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [day, setDay] = useState('1')
  const [channel, setChannel] = useState<Channel>('wallet_pixel')
  const [categoryId, setCategoryId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(initial?.name ?? '')
    setAmount(initial?.amount ?? 0)
    setDay(String(initial?.chargeDayOfMonth ?? 1))
    setChannel(initial?.channel ?? 'wallet_pixel')
    setCategoryId(initial?.categoryId ?? null)
  }, [open, initial])

  function clampDay(s: string): number { return Math.min(28, Math.max(1, Number(s) || 1)) }
  const canSave = name.trim().length > 0 && amount > 0 && !save.isPending

  function submit() {
    save.mutate(
      {
        ...(initial ? { id: initial.id } : {}),
        name: name.trim(), amount, chargeDayOfMonth: clampDay(day),
        categoryId, channel,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <BottomSheet open={open} title={initial ? 'Editar suscripción' : 'Nueva suscripción'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre (ej: Spotify)"
          className="bg-ink-2 border border-ink-line rounded-lg px-3 py-2.5 outline-none focus:border-accent" />

        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-zinc-600 mb-1">monto</p>
          <MoneyText value={amount} className="text-3xl text-zinc-50" />
        </div>

        <label className="flex items-center justify-between text-sm text-zinc-400">
          Día de cobro (1–28)
          <input inputMode="numeric" value={day} onChange={(e) => setDay(e.target.value)}
            className="w-20 bg-ink-2 border border-ink-line rounded-lg px-3 py-2 outline-none focus:border-accent font-mono text-right" />
        </label>

        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Chip key={c.id} label={c.label} active={channel === c.id} onClick={() => setChannel(c.id)} />
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip label="Sin categoría" active={categoryId === null} onClick={() => setCategoryId(null)} />
          {(categories.data ?? []).map((c) => (
            <Chip key={c.id} label={c.name} active={categoryId === c.id} onClick={() => setCategoryId(c.id)} />
          ))}
        </div>

        <NumberPad value={amount} onChange={setAmount} />

        {save.isError && <p className="text-debt text-sm">No se pudo guardar. Reintentá.</p>}
        <button onClick={submit} disabled={!canSave}
          className="bg-accent text-accent-deep font-medium rounded-xl py-3 active:scale-[0.98] transition-transform disabled:opacity-40">
          {save.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </BottomSheet>
  )
}
