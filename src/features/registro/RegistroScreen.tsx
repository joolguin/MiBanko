import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useRegisterTransaction } from '../../data/useRegisterTransaction'
import { useBudgets } from '../../data/useBudgets'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { budgetHint } from '../../data/budgetHint'
import { currentMonthKey } from '../../data/monthNav'
import { X } from '@phosphor-icons/react'
import { NumberPad } from '../../components/ui/NumberPad'
import { BottomSheet } from '../../components/ui/BottomSheet'
import { Picker } from '../../components/ui/Picker'
import { MoneyText } from '../../components/ui/MoneyText'
import type { Account, Category, Channel, TxType } from '../../data/types'

const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'wallet_pixel', label: 'Wallet Pixel' },
  { id: 'tarjeta_fisica', label: 'Tarjeta física' },
  { id: 'onepay', label: 'Onepay' },
  { id: 'transferencia_app', label: 'Transferencia' },
  { id: 'otro', label: 'Otro' },
]

export function RegistroScreen() {
  const nav = useNavigate()
  const accounts = useAccounts()
  const categories = useCategories()
  const register = useRegisterTransaction()
  const budgets = useBudgets()
  const monthTxs = useMonthTransactions(currentMonthKey(new Date()))

  const [amount, setAmount] = useState(0)
  const [accountId, setAccountId] = useState<string | null>(null)
  const [channel, setChannel] = useState<Channel>('wallet_pixel')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [sheet, setSheet] = useState<null | 'account' | 'channel' | 'category'>(null)

  // Default: primera cuenta (BICE por el orden de useAccounts).
  const account: Account | undefined = useMemo(() => {
    const list = accounts.data ?? []
    return list.find((a) => a.id === accountId) ?? list[0]
  }, [accounts.data, accountId])

  const category: Category | undefined = categories.data?.find((c) => c.id === categoryId)
  const hint = budgetHint(categoryId, amount, monthTxs.data ?? [], budgets.data ?? [], category?.name ?? '')
  const type: TxType = 'gasto'
  const canSave = amount > 0 && !!account && !register.isPending

  function save() {
    if (!account) return
    register.mutate(
      {
        accountId: account.id, accountType: account.type, type,
        amount, channel, categoryId, description: description || null,
        billingCycleId: null,
      },
      { onSuccess: () => nav('/') },
    )
  }

  return (
    // pb-6 = los mismos 24px que usa el <nav>: sin el pb-24 del shell, Guardar
    // quedaba pegado al borde inferior, donde vive la barra de gestos.
    <section className="px-6 pt-8 pb-6 flex flex-col min-h-[100dvh]">
      <header className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">registrar gasto</p>
        <button type="button" onClick={() => nav(-1)} aria-label="Cancelar"
          className="-mr-3 p-3 text-zinc-400 active:scale-[0.9] transition-transform">
          <X size={20} />
        </button>
      </header>
      <MoneyText value={amount} className="text-[52px] leading-none text-zinc-50 mt-1" />

      <div className="flex flex-wrap items-center gap-2 mt-6">
        <Picker label={account?.name ?? 'Cuenta'} onClick={() => setSheet('account')} />
        <span className="text-sm text-zinc-400 px-1">Gasto</span>
        <Picker label={CHANNELS.find((c) => c.id === channel)!.label} onClick={() => setSheet('channel')} />
        <Picker label={category?.name ?? 'Categoría'} onClick={() => setSheet('category')} falta={!category} />
      </div>

      {hint && (
        <p className={`mt-3 text-sm ${hint.state === 'over' ? 'text-debt' : 'text-amber-500'}`}>
          Con esto quedás en <MoneyText value={hint.projectedSpent} className="inline" /> de{' '}
          <MoneyText value={hint.amount} className="inline" /> en {hint.categoryName} ({Math.round(hint.pct * 100)}%)
        </p>
      )}

      <input value={description} onChange={(e) => setDescription(e.target.value)}
        placeholder="Descripción (opcional)"
        className="mt-4 bg-transparent border-b border-ink-line py-2 text-sm outline-none focus:border-accent placeholder:text-zinc-600" />

      <div className="mt-auto pt-6">
        <NumberPad value={amount} onChange={setAmount} />
        {register.isError && <p className="text-debt text-sm mt-3">No se pudo guardar. Reintentá.</p>}
        <button onClick={save} disabled={!canSave}
          className="w-full mt-4 bg-accent text-accent-deep font-medium rounded-xl py-4 active:scale-[0.98] transition-transform disabled:opacity-40">
          {register.isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      <BottomSheet open={sheet === 'account'} title="Cuenta" onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-1">
          {(accounts.data ?? []).map((a) => (
            <button key={a.id} onClick={() => { setAccountId(a.id); setSheet(null) }}
              className="text-left py-2.5 px-2 rounded-lg active:bg-ink-2">{a.name}</button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'channel'} title="Canal" onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-1">
          {CHANNELS.map((c) => (
            <button key={c.id} onClick={() => { setChannel(c.id); setSheet(null) }}
              className="text-left py-2.5 px-2 rounded-lg active:bg-ink-2">{c.label}</button>
          ))}
        </div>
      </BottomSheet>

      <BottomSheet open={sheet === 'category'} title="Categoría" onClose={() => setSheet(null)}>
        <div className="flex flex-col gap-1">
          {(categories.data ?? []).map((c) => (
            <button key={c.id} onClick={() => { setCategoryId(c.id); setSheet(null) }}
              className="text-left py-2.5 px-2 rounded-lg active:bg-ink-2">{c.name}</button>
          ))}
        </div>
      </BottomSheet>
    </section>
  )
}
