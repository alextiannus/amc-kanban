/**
 * PostFast Integration
 * Wraps the PostFast API for multi-platform social media publishing.
 * Brand owner configures their PostFast API key in Brand Settings.
 */

const POSTFAST_BASE = 'https://api.postfa.st'

// Map PostFast platform names → our internal platformId
const PLATFORM_MAP: Record<string, string> = {
  INSTAGRAM:    'instagram',
  TIKTOK:       'tiktok',
  FACEBOOK:     'facebook',
  YOUTUBE:      'youtube',
  X:            'x',
  TWITTER:      'x',
  LINKEDIN:     'linkedin',
  XIAOHONGSHU:  'xiaohongshu',
  BLUESKY:      'bluesky',
  THREADS:      'threads',
  PINTEREST:    'pinterest',
  SNAPCHAT:     'snapchat',
}

export interface PostFastAccount {
  id: string           // PostFast internal account ID
  platform: string     // e.g. "INSTAGRAM"
  platformId: string   // our normalized id e.g. "instagram"
  handle: string       // @username or display name
  displayName?: string
}

/**
 * Fetch all social accounts connected to this PostFast workspace.
 * GET /social-media/my-social-accounts
 */
export async function postfastFetchAccounts(apiKey: string): Promise<{
  success: boolean
  accounts: PostFastAccount[]
  error?: string
}> {
  try {
    const res = await fetch(`${POSTFAST_BASE}/social-media/my-social-accounts`, {
      headers: { 'pf-api-key': apiKey },
      // Short timeout to avoid long hangs
      signal: AbortSignal.timeout(10_000),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, accounts: [], error: err.message ?? `PostFast HTTP ${res.status}` }
    }

    const raw: any[] = await res.json()
    const accounts: PostFastAccount[] = raw.map(a => {
      const pfPlatform = (a.platform ?? '').toUpperCase()
      return {
        id: a.id,
        platform: pfPlatform,
        platformId: PLATFORM_MAP[pfPlatform] ?? pfPlatform.toLowerCase(),
        handle: a.platformUsername || a.displayName || a.id,
        displayName: a.displayName,
      }
    })

    return { success: true, accounts }
  } catch (e: any) {
    return { success: false, accounts: [], error: e.message }
  }
}

export interface PostFastPublishInput {
  apiKey: string
  platform: string        // instagram | xiaohongshu | tiktok | facebook | youtube | ...
  caption: string
  mediaUrls?: string[]
  hashtags?: string[]
  scheduledAt?: string    // ISO8601
}

export interface PostFastPublishResult {
  success: boolean
  postId?: string
  url?: string
  error?: string
}

export async function postfastPublish(input: PostFastPublishInput): Promise<PostFastPublishResult> {
  try {
    const res = await fetch(`${POSTFAST_BASE}/social-posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'pf-api-key': input.apiKey,
      },
      body: JSON.stringify({
        platform: input.platform,
        caption: input.caption,
        media_urls: input.mediaUrls ?? [],
        hashtags: input.hashtags ?? [],
        scheduled_at: input.scheduledAt ?? null,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message ?? `PostFast HTTP ${res.status}` }
    }

    const data = await res.json()
    return { success: true, postId: data.post_id, url: data.url }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export async function postfastReplyReview(input: {
  apiKey: string
  platform: 'google' | 'yelp'
  reviewId: string
  replyText: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${POSTFAST_BASE}/reviews/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'pf-api-key': input.apiKey },
      body: JSON.stringify({
        platform: input.platform,
        review_id: input.reviewId,
        reply: input.replyText,
      }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message ?? `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}
