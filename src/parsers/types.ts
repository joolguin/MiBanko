export type CartolaSource = 'bice_visa' | 'santander_vista'

export interface RawMovement {
  date: string                 // 'YYYY-MM-DD'
  amount: number               // entero CLP, valor absoluto
  description: string
  kind: 'gasto' | 'ingreso'
  bankCategory?: string        // string crudo del banco, sin mapear
  installments?: string        // "N de M" si M>1
  pending?: boolean            // venía con "* " (sujeto a confirmación)
}

export interface CartolaParser {
  parse(file: File): Promise<RawMovement[]>
}
