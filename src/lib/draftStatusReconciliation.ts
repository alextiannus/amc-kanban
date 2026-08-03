import type { PostFastPost } from './integrations/postfast'

export const LEGACY_POST_TIME_TOLERANCE_MS = 120_000

function normalizeCaption(value: string | null | undefined) {
  return (value ?? '').trim().replace(/\s+/g, ' ')
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
}): { post?: PostFastPost; ambiguousCount: number } {
  const now = input.now ?? Date.now()
  const toleranceMs = input.toleranceMs ?? LEGACY_POST_TIME_TOLERANCE_MS
  if (!input.scheduledAt || input.scheduledAt.getTime() > now) {
    return { ambiguousCount: 0 }
  }

  const scheduledAt = input.scheduledAt.getTime()
  const captions = new Set([normalizeCaption(input.caption)])
  if (input.hashtags?.length) {
    const hashtagText = input.hashtags
      .map((tag) => tag.trim())
      .filter(Boolean)
      .map((tag) => tag.startsWith('#') ? tag : `#${tag}`)
      .join(' ')
    captions.add(normalizeCaption(`${input.caption}\n\n${hashtagText}`))
  }
  const matches = input.providerPosts.filter((post) => {
    if (
      input.claimedProviderIds.has(post.id)
      || !captions.has(normalizeCaption(post.caption))
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

  return {
    post: matches.length === 1 ? matches[0] : undefined,
    ambiguousCount: matches.length,
  }
}
