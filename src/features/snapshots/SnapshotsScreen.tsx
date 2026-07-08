import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../../data/useAccounts'
import { useSaveSnapshot, useLatestSnapshotsByAccount } from '../../data/useSaveSnapshot'
import { NumberPad } from '../../components/ui/NumberPad'
import { MoneyText } from '../../components/ui/MoneyText'
import type { Account } from '../../data/types'

export function SnapshotsScreen() {
  const nav = useNavigate()
  const accounts = useAccounts()
  const latest = useLatestSnapshotsByAccount()
  const save = useSaveSnapshot()

  const relevant = (accounts.data ?? []).filter((a) => a.type === 'debit' || a.type === 'investment')
  const [active, setActive] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, number>>({})

  function currentValue(a: Account): number {
    return values[a.id] ?? latest.data?.[a.id]?.balance ?? 0
  }

  function save_() {
    const changed = Object.entries(values)
      .filter(([id, v]) => v !== (latest.data?.[id]?.balance ?? 0))
      .map(([accountId, balance]) => ({ accountId, balance }))
    if (changed.length === 0) return nav('/')
    save.mutate(changed, { onSuccess: () => nav('/') })
  }

  return (
    <section className="px-6 pt-8 flex flex-col min-h-[100dvh]">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600 mb-4">snapshots de saldo</p>
      <div className="flex flex-col gap-3">
        {relevant.map((a) => (
          <button key={a.id} onClick={() => setActive(a.id)}
            className={`text-left p-4 rounded-xl border ${active === a.id ? 'border-accent' : 'border-ink-line'}`}>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-zinc-300">{a.name}</span>
              <MoneyText value={currentValue(a)} className="text-lg text-zinc-50" />
            </div>
          </button>
        ))}
      </div>

      {active && (
        <div className="mt-auto pt-6">
          <NumberPad
            value={values[active] ?? latest.data?.[active]?.balance ?? 0}
            onChange={(n) => setValues((v) => ({ ...v, [active]: n }))}
          />
        </div>
      )}

      {save.isError && <p className="text-debt text-sm mt-3">No se pudo guardar. Reintentá.</p>}
      <button onClick={save_} disabled={save.isPending}
        className="w-full mt-4 bg-accent text-accent-deep font-medium rounded-xl py-4 active:scale-[0.98] transition-transform disabled:opacity-40">
        {save.isPending ? 'Guardando…' : 'Guardar'}
      </button>
    </section>
  )
}
