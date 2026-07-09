const CLP = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 0,
})

export function formatCLP(n: number): string {
  return `$${CLP.format(Math.round(n))}`
}

// Usa el signo menos tipográfico (U+2212) para que se vea parejo con los números mono.
// withPlus antepone un "+" a los positivos (para distinguir ingresos en la lista de
// movimientos); por defecto es false para no alterar el resto de la app (p. ej. el ciclo BICE).
export function formatSignedCLP(n: number, withPlus = false): string {
  const rounded = Math.round(n)
  if (rounded < 0) return `−${formatCLP(Math.abs(rounded))}`
  if (withPlus && rounded > 0) return `+${formatCLP(rounded)}`
  return formatCLP(rounded)
}
