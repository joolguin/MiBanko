import { describe, it, expect } from 'vitest'
import tailwindColors from 'tailwindcss/colors.js'
import config from '../../tailwind.config.js'

// Los tokens se LEEN del config, no se duplican: si alguien oscurece `faint`,
// el test lo caza. Duplicar los hex acá haría que el test se probara a sí mismo.
const colors = (config.theme as { extend: { colors: Record<string, any> } }).extend.colors
const FONDO: string = colors.ink.DEFAULT // #09090b, el que tokens.css fija en html/body
const AA = 4.5

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contraste(unHex: string, otroHex: string): number {
  const [alta, baja] = [luminancia(unHex), luminancia(otroHex)].sort((a, b) => b - a)
  return (alta + 0.05) / (baja + 0.05)
}

describe('tokens de texto atenuado', () => {
  it('should_PassAA_When_FaintOnInk', () => {
    expect(contraste(colors.faint, FONDO)).toBeGreaterThanOrEqual(AA)
  })

  it('should_PassAA_When_MutedOnInk', () => {
    expect(contraste(colors.muted, FONDO)).toBeGreaterThanOrEqual(AA)
  })

  // faint es el nivel más recesivo: si alguien invierte los valores, la jerarquía
  // del diseño se da vuelta en silencio.
  it('should_KeepFaintMoreRecessiveThanMuted', () => {
    expect(contraste(colors.faint, FONDO)).toBeLessThan(contraste(colors.muted, FONDO))
  })
})

// Estos leen la paleta real de Tailwind, no copias: documentan por qué existen
// faint y muted, y avisan si algún día Tailwind cambia sus valores.
describe('los zinc de Tailwind que motivaron los tokens', () => {
  it('should_FailAA_When_Zinc600OnInk', () => {
    expect(contraste(tailwindColors.zinc[600], FONDO)).toBeLessThan(AA)
  })

  it('should_FailAA_When_Zinc500OnInk', () => {
    expect(contraste(tailwindColors.zinc[500], FONDO)).toBeLessThan(AA)
  })

  it('should_PassAA_When_Zinc400OnInk', () => {
    expect(contraste(tailwindColors.zinc[400], FONDO)).toBeGreaterThanOrEqual(AA)
  })
})
