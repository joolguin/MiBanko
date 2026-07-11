import type { RawMovement } from '../../parsers/types'
import type { ExistingTx } from '../../data/useImportPreview'

function norm(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function flagDuplicates(movements: RawMovement[], existing: ExistingTx[]): boolean[] {
  return movements.map((m) =>
    existing.some((e) =>
      e.transactionDate === m.date &&
      e.amount === m.amount &&
      norm(e.description) === norm(m.description),
    ),
  )
}
