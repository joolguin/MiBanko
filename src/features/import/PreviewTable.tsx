import type { Category } from '../../data/types'
import { MoneyText } from '../../components/ui/MoneyText'

export interface PreviewRow {
  date: string
  description: string
  amount: number
  kind: 'gasto' | 'ingreso'
  categoryId: string | null
  selected: boolean
  isDuplicate: boolean
  installments?: string
}

interface Props {
  rows: PreviewRow[]
  categories: Category[]
  onChange: (index: number, patch: Partial<PreviewRow>) => void
  onToggleAll: (selected: boolean) => void
  onBulkCategory: (categoryId: string) => void
}

export function PreviewTable({ rows, categories, onChange, onToggleAll, onBulkCategory }: Props) {
  const allSelected = rows.length > 0 && rows.every((r) => r.selected)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-[11px] text-zinc-500">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={allSelected} onChange={(e) => onToggleAll(e.target.checked)} />
          Marcar todas
        </label>
        <select defaultValue="" onChange={(e) => e.target.value && onBulkCategory(e.target.value)}
          className="bg-transparent border border-ink-line rounded-lg px-2 py-1">
          <option value="">Categoría en lote…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 border-t border-ink-line py-2">
          <input type="checkbox" checked={r.selected} onChange={(e) => onChange(i, { selected: e.target.checked })} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-zinc-200 truncate">{r.description}</p>
            <p className="text-[11px] text-zinc-500">
              {r.date}
              {r.installments && <span className="ml-2 text-[var(--fresh-warn)]">en cuotas ({r.installments})</span>}
              {r.isDuplicate && <span className="ml-2 text-debt">posible duplicado</span>}
            </p>
          </div>
          <select value={r.kind} onChange={(e) => onChange(i, { kind: e.target.value as PreviewRow['kind'] })}
            className="bg-transparent border border-ink-line rounded-lg px-1.5 py-1 text-xs">
            <option value="gasto">gasto</option>
            <option value="ingreso">ingreso</option>
          </select>
          <select value={r.categoryId ?? ''} onChange={(e) => onChange(i, { categoryId: e.target.value || null })}
            className="bg-transparent border border-ink-line rounded-lg px-1.5 py-1 text-xs max-w-[7rem]">
            <option value="">—</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <MoneyText value={r.amount} className="text-sm text-zinc-200 w-20 text-right" />
        </div>
      ))}
    </div>
  )
}
