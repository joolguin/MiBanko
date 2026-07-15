import { describe, it, expect } from 'vitest'
import { shouldRun, markRan } from './useRunDueSubscriptions'
import { santiagoDateKey } from './santiagoDate'

function memStorage(initial: Record<string, string> = {}) {
  const m = { ...initial }
  return {
    getItem: (k: string) => (k in m ? m[k] : null),
    setItem: (k: string, v: string) => { m[k] = v },
    _map: m,
  }
}

describe('throttle de run_due_subscriptions', () => {
  const now = new Date('2026-07-08T12:00:00Z')

  it('should_RunTrue_When_NuncaCorrioHoy', () => {
    expect(shouldRun(memStorage(), now)).toBe(true)
  })
  it('should_RunFalse_When_YaCorrioHoy', () => {
    const s = memStorage()
    markRan(s, now)
    expect(shouldRun(s, now)).toBe(false)
  })
  it('should_RunTrue_When_CorrioOtroDia', () => {
    const s = memStorage({ 'mibanko:subs-run': santiagoDateKey(new Date('2026-07-07T12:00:00Z')) })
    expect(shouldRun(s, now)).toBe(true)
  })
})
