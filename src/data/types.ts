export type AccountType = 'debit' | 'credit' | 'investment'
export type TxType = 'ingreso' | 'gasto' | 'pago_tarjeta' | 'transferencia_interna'
export type Channel =
  | 'tarjeta_fisica' | 'wallet_pixel' | 'transferencia_app' | 'onepay' | 'otro'

export interface Account {
  id: string
  name: string
  type: AccountType
  bank: string | null
}

export interface Category {
  id: string
  name: string
}

export interface Slrd {
  slrdInmediato: number
  slrdTotal: number
  saldoContable: number
  saldoDebito: number
  saldoInversion: number
  deudaFacturada: number
  deudaNoFacturada: number
}

export interface NewTransaction {
  accountId: string
  accountType: AccountType
  type: TxType
  amount: number
  channel: Channel
  categoryId: string | null
  description: string | null
  billingCycleId: string | null
}
