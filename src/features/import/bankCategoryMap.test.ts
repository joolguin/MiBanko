import { describe, it, expect } from 'vitest'
import { mapBankCategory } from './bankCategoryMap'

describe('mapBankCategory', () => {
  it('should_MapKnownBankCategory_When_Recognized', () => {
    expect(mapBankCategory('Autos Y Transporte')).toBe('Transporte')
    expect(mapBankCategory('supermercados')).toBe('Comida')
  })

  it('should_ReturnUndefined_When_UnknownOrEmpty', () => {
    expect(mapBankCategory('Hogar')).toBeUndefined()
    expect(mapBankCategory(undefined)).toBeUndefined()
    expect(mapBankCategory('')).toBeUndefined()
  })
})
