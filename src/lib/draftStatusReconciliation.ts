import type { PostFastPost } from './integrations/postfast'

export const LEGACY_POST_TIME_TOLERANCE_MS = 120_000
export const DRAFT_STATUS_RECONCILIATION_GRACE_MS = 30 * 60 * 1000

export function isDraftReconciliationStale(input: {
  status: 'scheduled' | 'publishing'
  scheduledAt: Date | null
  updatedAt: Date
  now?: Date
  graceMs?: number
}) {
  const now = input.now ?? new Date()
  const graceMs = input.graceMs ?? DRAFT_STATUS_RECONCILIATION_GRACE_MS
  const anchor = input.status === 'scheduled'
    ? (input.scheduledAt ?? input.updatedAt)
    : input.updatedAt
  return anchor.getTime() + graceMs <= now.getTime()
}

export function normalizeReconciliationCaption(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function findUniqueLegacyPostMatch(input: {
  caption: string
  hashtags?: string[]
  scheduledAt: Date | null
  providerAccountId?: string
  providerPosts: PostFastPost[]
  claimedProviderIds: ReadonlySet<string>
  now?: number
  toleranceMs?: number
  allowFuture?: boolean
}): {
  post?: PostFastPost
  ambiguousCount: number
  equivalentDuplicateCount: number
  matchedPostIds: string[]
} {
  const now = input.now ?? Date.now()
  const toleranceMs = input.toleranceMs ?? LEGACY_POST_TIME_TOLERANCE_MS
  if (!input.scheduledAt || (!input.allowFuture && input.scheduledAt.getTime() > now)) {
    return { ambiguousCount: 0, equivalentDuplicateCount: 0, matchedPostIds: [] }
  }

  const scheduledAt = input.scheduledAt.getTime()
  const captions = new Set([normalizeReconciliationCaption(input.caption)])
  if (input.hashtags?.length) {
    const hashtagText = input.hashtags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.startsWith('#') ? tag : `#${tag}`)
      .join(' ')
    captions.add(normalizeReconciliationCaption(`${input.caption}\n\n${hashtagText}`))
  }
  const matches = input.providerPosts.filter((post) => {
    if (
      input.claimedProviderIds.has(post.id)
      || !captions.has(normalizeReconciliationCaption(post.caption))
      || (input.providerAccountId && post.socialMediaId !== input.providerAccountId)
    ) {
      return false
    }

    const providerTime = post.scheduledAt || post.publishedAt
    if (!providerTime) return false
    const providerTimestamp = new Date(providerTime).getTime()
    return Number.isFinite(providerTimestamp)
      && Math.abs(providerTimestamp - scheduledAt) <= toleranceMs
  })

  const matchingStatuses = new Set(matches.map((post) => post.status))
  const closestMatches = input.providerAccountId && matches.length > 1 && matchingStatuses.size === 1
    ? (() => {
        const deltas = matches.map((post) => {
          const providerTime = post.scheduledAt || post.publishedAt || ''
          return Math.abs(Date.parse(providerTime) - scheduledAt)
        })
        const minimumDelta = Math.min(...deltas)
        return matches.filter((_post, index) => deltas[index] === minimumDelta)
      })()
    : matches

  if (closestMatches.length === 1) {
    return {
      post: closestMatches[0],
      ambiguousCount: 1,
      equivalentDuplicateCount: 0,
      matchedPostIds: [closestMatches[0].id],
    }
  }

  const finalStatuses = new Set(closestMatches.map((post) => post.status))
  const accountIds = new Set(closestMatches.map((post) => post.socialMediaId ?? ''))
  const normalizedCaptions = new Set(closestMatches.map((post) => normalizeReconciliationCaption(post.caption)))
  const providerTimes = new Set(closestMatches.map((post) => {
    const timestamp = Date.parse(post.scheduledAt || post.publishedAt || '')
    return Number.isFinite(timestamp) ? timestamp : null
  }))
  const isEquivalentFinalDuplicate = closestMatches.length > 1
    && finalStatuses.size === 1
    && accountIds.size === 1
    && normalizedCaptions.size === 1
    && providerTimes.size === 1
    && ['published', 'failed'].includes(closestMatches[0].status)

  if (isEquivalentFinalDuplicate) {
    const sorted = [...closestMatches].sort((left, right) => {
      const leftTime = Date.parse(left.publishedAt || left.scheduledAt || '')
      const rightTime = Date.parse(right.publishedAt || right.scheduledAt || '')
      const safeLeft = Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER
      const safeRight = Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER
      return safeLeft - safeRight || left.id.localeCompare(right.id)
    })
    return {
      post: sorted[0],
      ambiguousCount: closestMatches.length,
      equivalentDuplicateCount: closestMatches.length,
      matchedPostIds: closestMatches.map((post) => post.id),
    }
  }

  return {
    ambiguousCount: closestMatches.length,
    equivalentDuplicateCount: 0,
    matchedPostIds: [],
  }
}
