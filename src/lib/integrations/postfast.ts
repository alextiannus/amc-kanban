/**
 * PostFast Integration
 * Wraps the PostFast API for multi-platform social media publishing.
 * Brand owner configures their PostFast API key in Brand Settings.
 */

const POSTFAST_BASE = 'https://api.postfast.io/v1'

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
    const res = await fetch(`${POSTFAST_BASE}/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': input.apiKey,
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
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': input.apiKey },
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
