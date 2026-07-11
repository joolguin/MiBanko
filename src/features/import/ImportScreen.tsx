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

type Source = 'bice_visa' | 'santander_vista'

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

  const [source, setSource] = useState<Source>('bice_visa')
  const [movements, setMovements] = useState<RawMovement[] | null>(null)
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [parseError, setParseError] = useState(false)
  const [parseEmpty, setParseEmpty] = useState(false)

  const account = accounts.data?.find((a) =>
    source === 'bice_visa' ? a.type === 'credit' : a.type === 'debit',
  )

  const range = useMemo(() => {
    if (!movements || movements.length === 0) return null
    const dates = movements.map((m) => m.date).sort()
    return { from: dates[0], to: dates[dates.length - 1] }
  }, [movements])

  const preview = useImportPreview(account?.id, range)

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
    setParseEmpty(false)
    setMovements(null)
    setRows([])
    try {
      const parsed = source === 'bice_visa'
        ? await parseBiceVisaCsv(file)
        : await (await import('../../parsers/santanderPdfExtract')).parseSantanderPdf(file)
      if (parsed.length === 0) {
        setParseEmpty(true)
        return
      }
      setMovements(parsed)
    } catch {
      setParseError(true)
    }
  }

  function selectSource(next: Source) {
    setSource(next)
    setMovements(null)
    setRows([])
    setParseError(false)
    setParseEmpty(false)
  }

  function patchRow(index: number, patch: Partial<PreviewRow>) {
    setRows((rs) => rs.map((r, i) => (i === index ? { ...r, ...patch } : r)))
  }

  const selected = rows.filter((r) => r.selected)
  const slrdDrop = selected.filter((r) => r.kind === 'gasto').reduce((s, r) => s + r.amount, 0)

  function confirm() {
    if (!account || selected.length === 0) return
    importTx.mutate({
      accountId: account.id,
      billingCycleId: null,
      rows: selected.map((r) => ({
        date: r.date, amount: r.amount, description: r.description, kind: r.kind, categoryId: r.categoryId,
      })),
    }, { onSuccess: () => nav('/') })
  }

  return (
    <section className="px-6 pt-8 flex flex-col gap-4">
      <p className="text-[11px] uppercase tracking-[0.14em] text-zinc-600">importar movimientos</p>

      <div className="flex gap-2">
        <button onClick={() => selectSource('bice_visa')}
          className={`rounded-lg px-3 py-1.5 text-sm ${source === 'bice_visa'
            ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'}`}>
          BICE Visa
        </button>
        <button onClick={() => selectSource('santander_vista')}
          className={`rounded-lg px-3 py-1.5 text-sm ${source === 'santander_vista'
            ? 'bg-accent text-accent-deep' : 'border border-ink-line text-zinc-400'}`}>
          Santander
        </button>
      </div>

      <label className="text-sm text-zinc-300">
        {source === 'bice_visa' ? 'Archivo de cartola (.csv)' : 'Archivo de cartola (.pdf)'}
        <input type="file" accept={source === 'bice_visa' ? '.csv' : '.pdf'} aria-label="Archivo de cartola"
          onChange={(e) => { if (e.target.files?.[0]) onFile(e.target.files[0]); e.target.value = '' }}
          className="mt-2 block w-full text-xs" />
      </label>

      {parseError && <p className="text-debt text-sm">No se pudo leer el archivo. Revisá que sea la cartola CSV de la Visa.</p>}

      {parseEmpty && <p className="text-debt text-sm">No se reconocieron movimientos en el archivo. Revisá que sea la cartola CSV de la Visa.</p>}

      {rows.length > 0 && (
        <>
          <div className="text-[11px] text-zinc-500">
            {selected.length} de {rows.length} seleccionados ·{' '}
            {source === 'bice_visa'
              ? <>bajará tu SLRD en <MoneyText value={slrdDrop} className="text-debt" /></>
              : <span>solo analítica, no afecta tu SLRD</span>}
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
