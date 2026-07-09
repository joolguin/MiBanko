import { describe, it, expect } from 'vitest'
import { mapSubscriptionRow } from './useSubscriptions'

describe('mapSubscriptionRow', () => {
  it('should_MapSnakeToCamel_When_FullRow', () => {
    const r = mapSubscriptionRow({
      id: 's1', name: 'Spotify', amount: 5900, charge_day_of_month: 5,
      category_id: 'cat1', channel: 'wallet_pixel', is_active: true,
    })
    expect(r).toEqual({
      id: 's1', name: 'Spotify', amount: 5900, chargeDayOfMonth: 5,
      categoryId: 'cat1', channel: 'wallet_pixel', isActive: true,
    })
  })
  it('should_NullCategory_When_Absent', () => {
    const r = mapSubscriptionRow({
      id: 's2', name: 'Gym', amount: 30000, charge_day_of_month: 1,
      category_id: null, channel: 'otro', is_active: false,
    })
    expect(r.categoryId).toBeNull()
    expect(r.isActive).toBe(false)
  })
})
