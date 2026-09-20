export type SubscriptionSummary = {
  id: string; planName: string; status: string; feeWaived: boolean
  contractStartDate: Date | string | null; contractEndDate: Date | string | null; createdAt: Date | string
}
export function monthWindow(now = new Date()) {
  const local = new Date(now.getTime() + 8 * 3600_000)
  return { start: new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) - 8 * 3600_000), end: now }
}
export function subscriptionState(sub: SubscriptionSummary, now: Date): string {
  if (sub.status !== 'ACTIVE') return sub.status
  if (sub.contractEndDate && new Date(sub.contractEndDate) <= now) return 'EXPIRED'
  if (sub.contractStartDate && new Date(sub.contractStartDate) > now) return 'UPCOMING'
  return 'ACTIVE'
}
export function selectSubscription(subs: SubscriptionSummary[], now: Date) {
  const sorted = [...subs].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.id.localeCompare(b.id))
  return sorted.find(s => subscriptionState(s, now) === 'ACTIVE') || sorted[0]
}
export function canReadOperations(roles: readonly string[], grants: readonly string[]) {
  return roles.includes('ADMIN') || (roles.includes('AMC_PRINCIPAL') && grants.includes('brand.read') && grants.includes('analytics.read'))
}
