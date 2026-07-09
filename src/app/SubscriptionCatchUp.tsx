import { useRunDueSubscriptions } from '../data/useRunDueSubscriptions'

export function SubscriptionCatchUp() {
  useRunDueSubscriptions()
  return null
}
