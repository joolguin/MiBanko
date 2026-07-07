const CLP = new Intl.NumberFormat('es-CL', {
  maximumFractionDigits: 0,
})

export function formatCLP(n: number): string {
  return `$${CLP.format(Math.round(n))}`
}

// Usa el signo menos tipográfico (U+2212) para que se vea parejo con los números mono.
export function formatSignedCLP(n: number): string {
  const rounded = Math.round(n)
  if (rounded < 0) return `−${formatCLP(Math.abs(rounded))}`
  return formatCLP(rounded)
}
