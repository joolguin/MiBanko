export function isStale(ageDays: number | null, limitDays: number): boolean {
  return ageDays != null && ageDays > limitDays
}
