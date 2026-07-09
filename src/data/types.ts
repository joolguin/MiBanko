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

export interface Subscription {
  id: string
  name: string
  amount: number
  chargeDayOfMonth: number
  categoryId: string | null
  channel: Channel
  isActive: boolean
}

export interface SubscriptionInput {
  id?: string
  name: string
  amount: number
  chargeDayOfMonth: number
  categoryId: string | null
  channel: Channel
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

export interface SlrdHistoryPoint {
  snapshotDate: string
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

export interface BiceConfig { closingDay: number; dueDay: number }
export interface UserSettings { freshLimitDays: number }
export interface CycleDates { cycleStart: string; cycleEnd: string; dueDate: string }

export interface BillingCycle {
  id: string
  cycleStart: string
  cycleEnd: string
  dueDate: string
  billedAmount: number
  isPaid: boolean
}

export interface CloseCycleResult {
  cycleId: string
  billedAmount: number
  sumaLedger: number
  diferencia: number
}

export type MonthKey = string // 'AAAA-MM'
