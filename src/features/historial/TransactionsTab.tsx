import { useEffect, useState } from 'react'
import { useMonthTransactions } from '../../data/useMonthTransactions'
import { MonthNav } from './MonthNav'
import { Skeleton } from '../../components/ui/Skeleton'
import { MoneyText } from '../../components/ui/MoneyText'
import type { MonthKey, MonthTx, TxType } from '../../data/types'

const ALL = 'todas'
const TYPE_LABELS: Record<TxType, string> = {
  ingreso: 'Ingreso', gasto: 'Gasto', pago_tarjeta: 'Pago tarjeta',
  transferencia_interna: 'Transferencia',
}

function uniqueSorted(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null))].sort()
}

// Signo de exhibición: solo el ingreso suma; el resto resta.
function displayAmount(tx: MonthTx): number {
  return tx.type === 'ingreso' ? tx.amount : -tx.amount
}

export function TransactionsTab(
  { month, onMonthChange }: { month: MonthKey; onMonthChange: (m: MonthKey) => void },
) {
  const txs = useMonthTransactions(month)
  const [category, setCategory] = useState(ALL)
  const [type, setType] = useState(ALL)
  const [account, setAccount] = useState(ALL)

  // Los filtros no deben sobrevivir a un cambio de mes: si quedaran aplicados,
  // el <select> podría mostrar un value sin <option> y la lista se vería vacía
  // aunque el mes tenga movimientos.
  useEffect(() => {
    setCategory(ALL)
    setType(ALL)
    setAccount(ALL)
  }, [month])

  const all = txs.data ?? []
  const categories = uniqueSorted(all.map((t) => t.categoryName))
  const accounts = uniqueSorted(all.map((t) => t.accountName))
  const types = uniqueSorted(all.map((t) => t.type))

  const visible = all.filter((t) =>
    (category === ALL || t.categoryName === category) &&
    (type === ALL || t.type === type) &&
    (account === ALL || t.accountName === account),
  )

  return (
    <div>
      <MonthNav month={month} onChange={onMonthChange} />

      {txs.isLoading && <Skeleton className="h-48 w-full mt-4" />}

      {txs.isError && (
        <div className="mt-4">
          <p className="text-debt text-sm">No se pudieron cargar los movimientos. Reintentá.</p>
          <button onClick={() => txs.refetch()}
            className="mt-2 border border-ink-line rounded-lg px-3 py-1.5 text-sm active:scale-[0.98]">
            Reintentar
          </button>
        </div>
      )}

      {!txs.isLoading && !txs.isError && (
        <>
          <div className="flex gap-2 mt-4 text-sm">
            <label className="sr-only" htmlFor="f-cat">Categoría</label>
            <select id="f-cat" aria-label="Categoría" value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-type">Tipo</label>
            <select id="f-type" aria-label="Tipo" value={type}
              onChange={(e) => setType(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todos</option>
              {types.map((t) => <option key={t} value={t}>{TYPE_LABELS[t as TxType]}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-acc">Cuenta</label>
            <select id="f-acc" aria-label="Cuenta" value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="bg-ink-2 border border-ink-line rounded-lg px-2 py-1.5 text-zinc-300">
              <option value={ALL}>Todas</option>
              {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-zinc-500 mt-6">Sin movimientos con estos filtros.</p>
          ) : (
            <div className="mt-3" data-testid="tx-list">
              {visible.map((t) => (
                <div key={t.id} data-testid="tx-row"
                  className="py-3 border-t border-ink-line flex justify-between items-center">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm text-zinc-200">{t.categoryName ?? TYPE_LABELS[t.type]}</span>
                    <span className="text-[11px] text-zinc-500">{t.transactionDate} · {t.accountName}</span>
                  </div>
                  <MoneyText value={displayAmount(t)} signed className="text-sm text-zinc-300" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
