import type { TxType, AccountType } from './types'

export interface DeltaInput {
  type: TxType
  accountType: AccountType
  billingCycleId: string | null
  amount: number
}

// Espejo cliente de la vista v_slrd: solo un gasto en tarjeta de crédito aún no
// facturado compromete deuda nueva y baja el SLRD. Todo lo demás entra vía snapshot
// o vía is_paid del ciclo, nunca directo.
export function slrdDelta({ type, accountType, billingCycleId, amount }: DeltaInput): number {
  const esGastoBiceSinFacturar =
    type === 'gasto' && accountType === 'credit' && billingCycleId === null
  return esGastoBiceSinFacturar ? -amount : 0
}
