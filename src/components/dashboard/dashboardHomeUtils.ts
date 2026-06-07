export type ActionCardType = 'urgent' | 'review'

// Map API ActionItem → local display shape.
export function toCardType(apiType: string | null | undefined, priority: string | null | undefined): ActionCardType {
  if (apiType === 'sentiment_alert' || priority === 'urgent') return 'urgent'
  return 'review'
}

export function fmtFollower(n: number | null | undefined): string {
  if (n == null) return '—'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

export function normalizeDashboardPlatformId(platformId: string): string {
  const p = String(platformId ?? '').toLowerCase().trim()
  if (
    p === 'google' ||
    p === 'gbp' ||
    p === 'gmb' ||
    p === 'google_maps' ||
    p === 'googlemaps' ||
    p === 'google_business_profile' ||
    p === 'googlebusinessprofile' ||
    p === 'google_my_business' ||
    p === 'googlemybusiness'
  ) {
    return 'google'
  }
  return p
}
