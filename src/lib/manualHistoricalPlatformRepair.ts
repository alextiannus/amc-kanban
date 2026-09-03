export const MANUAL_HISTORICAL_POST_MARKER = 'manual-historical-published-post'

export type ManualHistoricalDraftRepairInput = {
  agentNote?: string | null
  status?: string | null
  platformPostId?: string | null
  postUrl?: string | null
  deliveryJobCount?: number
  account?: {
    platformId?: string | null
    handle?: string | null
  } | null
}

export type TikTokAccountCandidate = {
  id: string
  platformId: string
  handle?: string | null
}

export type ManualHistoricalDraftInspection = {
  kind: 'repair' | 'review' | 'ignore'
  reason: string
  tiktokHandle?: string
}

function normalizeHandle(value: string | null | undefined): string {
  return String(value ?? '').trim().replace(/^@/, '').toLowerCase()
}

function hostnameMatches(hostname: string, domain: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.$/, '')
  return normalized === domain || normalized.endsWith(`.${domain}`)
}

export function parseTikTokPostUrl(value: string | null | undefined): { hostname: string; handle?: string } | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (!hostnameMatches(url.hostname, 'tiktok.com')) return null
    const handleSegment = url.pathname
      .split('/')
      .map(segment => decodeURIComponent(segment).trim())
      .find(segment => segment.startsWith('@') && segment.length > 1)
    const handle = normalizeHandle(handleSegment)
    return { hostname: url.hostname.toLowerCase(), ...(handle ? { handle } : {}) }
  } catch {
    return null
  }
}

function isKnownInstagramUrl(value: string | null | undefined): boolean {
  const raw = String(value ?? '').trim()
  if (!raw) return false
  try {
    const hostname = new URL(raw).hostname
    return hostnameMatches(hostname, 'instagram.com') || hostnameMatches(hostname, 'instagr.am')
  } catch {
    return false
  }
}

export function inspectManualHistoricalDraft(
  draft: ManualHistoricalDraftRepairInput,
): ManualHistoricalDraftInspection {
  if (draft.agentNote !== MANUAL_HISTORICAL_POST_MARKER) return { kind: 'ignore', reason: 'not_manual_historical_post' }
  if (String(draft.status ?? '').toLowerCase() !== 'published') return { kind: 'ignore', reason: 'not_published' }
  if (String(draft.account?.platformId ?? '').toLowerCase() !== 'instagram') return { kind: 'ignore', reason: 'not_instagram' }
  if (normalizeHandle(draft.account?.handle) !== 'unconfigured') return { kind: 'ignore', reason: 'not_instagram_placeholder' }

  const tiktokUrl = parseTikTokPostUrl(draft.postUrl)
  if (tiktokUrl) {
    if (draft.platformPostId) return { kind: 'review', reason: 'has_platform_post_id', tiktokHandle: tiktokUrl.handle }
    if ((draft.deliveryJobCount ?? 0) > 0) return { kind: 'review', reason: 'has_delivery_jobs', tiktokHandle: tiktokUrl.handle }
    return { kind: 'repair', reason: 'confirmed_tiktok_url', tiktokHandle: tiktokUrl.handle }
  }

  if (!String(draft.postUrl ?? '').trim()) return { kind: 'review', reason: 'missing_post_url' }
  if (isKnownInstagramUrl(draft.postUrl)) return { kind: 'ignore', reason: 'confirmed_instagram_url' }
  return { kind: 'review', reason: 'unrecognized_post_url' }
}

export function chooseTikTokRepairAccount(
  accounts: TikTokAccountCandidate[],
  urlHandle?: string | null,
): TikTokAccountCandidate | null {
  const tiktokAccounts = accounts.filter(account => account.platformId.trim().toLowerCase() === 'tiktok')
  const normalizedUrlHandle = normalizeHandle(urlHandle)
  if (normalizedUrlHandle) {
    const exactMatches = tiktokAccounts.filter(account => {
      const handle = normalizeHandle(account.handle)
      return handle !== 'unconfigured' && handle === normalizedUrlHandle
    })
    if (exactMatches.length === 1) return exactMatches[0]
  }

  return tiktokAccounts.find(account => normalizeHandle(account.handle) === 'unconfigured') ?? null
}
