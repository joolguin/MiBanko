import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAccounts } from '../../data/useAccounts'
import { useCategories } from '../../data/useCategories'
import { useImportPreview } from '../../data/useImportPreview'
import { useImportTransactions } from '../../data/useImportTransactions'
import { parseBiceVisaCsv } from '../../parsers/biceVisaCsv'
import { flagDuplicates } from './importDedup'
import { mapBankCategory } from './bankCategoryMap'
import { PreviewTable, type PreviewRow } from './PreviewTable'
import { MoneyText } from '../../components/ui/MoneyText'
import type { RawMovement } from '../../parsers/types'
import type { Category } from '../../data/types'

function resolveCategoryId(m: RawMovement, categories: Category[]): string | null {
  const name = mapBankCategory(m.bankCategory)
  if (!name) return null
  return categories.find((c) => c.name.toLowerCase() === name.toLowerCase())?.id ?? null
}

export function ImportScreen() {
  const nav = useNavigate()
  const accounts = useAccounts()
  const categories = useCategories()
  const importTx = useImportTransactions()

  const [movements, setMovements] = useState<RawMovement[] | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [parseError, setParseError] = useState(false)

  const biceAccount = accounts.data?.find((a) => a.type === 'credit')

  const range = useMemo(() => {
    if (!movements || movements.length === 0) return null
    const dates = movements.map((m) => m.date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [movements])

  const preview = useImportPreview(biceAccount?.id, range)

  const builtForRef = useRef<RawMovement[] | null>(null)

  useEffect(() => {
    if (!movements) {
      builtForRef.current = null
      return
    }
    if (builtForRef.current === movements) return
    if (preview.isLoading) return
    const cats = categories.data ?? []
    const dupFlags = flagDuplicates(movements, preview.data ?? [])
    setRows(movements.map((m, i) => ({
      date: m.date, description: m.description, amount: m.amount, kind: m.kind,
      installments: m.installments, isDuplicate: dupFlags[i], selected: !dupFlags[i],
      categoryId: resolveCategoryId(m, cats),
    })))
    builtForRef.current = movements
  }, [movements, preview.data, preview.isLoading, categories.data])

  async function onFile(file: File) {
    setParseError(false)
    setMovements(null)
    setRows([])
    try {
      setMovements(await parseBiceVisaCsv(file))
    } catch {
      setParseError(true)
    }
  }

  function patchRow(index: number, patch: Partial<PreviewRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const selected = rows.filter((r) => r.selected)
  const slrdDrop = selected.filter((r) => r.kind === 'gasto').reduce((s, r) => s + r.amount, 0)

  function confirm() {
    if (!biceAccount || selected.length === 0) return
    importTx.mutate({
      accountId: biceAccount.id,
      billingCycleId: null,
      rows: selected.map((r) => ({
        date: r.date, amount: r.amount, description: r.description, kind: r.kind, categoryId: r.categoryId,
      })),
    }, { onSuccess: () => nav('/') })
  }

  return (
    <section className="px-6 pt-8 flex flex-col gap-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">importar · BICE Visa</p>

      <label className="text-sm text-zinc-300">
        Archivo de cartola (.csv)
        <input type="file" accept=".csv" aria-label="Archivo de cartola"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onFile(file)
            e.target.value = ''
          }}
          className="mt-2 block w-full text-xs" />
      </label>

      {parseError && <p className="text-debt text-sm">No se pudo leer el archivo. Revisá que sea la cartola CSV de la Visa.</p>}

      {rows.length > 0 && (
        <>
          <div className="text-[11px] text-zinc-500">
            {selected.length} de {rows.length} seleccionados · bajará tu SLRD en{' '}
            <MoneyText value={slrdDrop} className="text-debt" />
          </div>
          <PreviewTable
            rows={rows} categories={categories.data ?? []}
            onChange={patchRow}
            onToggleAll={(sel) => setRows((rs) => rs.map((r) => ({ ...r, selected: sel })))}
            onBulkCategory={(categoryId) => setRows((rs) => rs.map((r) => (r.selected ? { ...r, categoryId } : r)))}
          />
          {importTx.isError && <p className="text-debt text-sm">No se pudo importar. Reintentá.</p>}
          <button onClick={confirm} disabled={selected.length === 0 || importTx.isPending}
            className="w-full mt-2 bg-accent text-accent-deep font-medium rounded-xl py-4 active:scale-[0.98] transition-transform disabled:opacity-40">
            {importTx.isPending ? 'Importando…' : `Importar ${selected.length} movimientos`}
          </button>
        </>
      )}
    </section>
  )
}
