// Traduce la categoría cruda de la cartola BICE a una categoría de la app.
// Solo mapea las inequívocas; el resto queda sin sugerencia (el usuario asigna
// en la preview). Diccionario extensible a medida que aparezcan más categorías.
const BANK_TO_APP: Record<string, string> = {
  'autos y transporte': 'Transporte',
  'restaurantes': 'Comida',
  'supermercados': 'Comida',
  'alimentación': 'Comida',
  'entretención': 'Hobbies',
  'entretenimiento': 'Hobbies',
}

export function mapBankCategory(bankCategory: string | undefined): string | undefined {
  if (!bankCategory) return undefined
  return BANK_TO_APP[bankCategory.trim().toLowerCase()]
}
