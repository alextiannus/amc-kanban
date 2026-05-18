/**
 * Google Business Integration
 * Fetches reviews from Google My Business API and posts replies.
 * Brand owner configures googlePlaceId + googleApiKey in Brand Settings.
 */

export interface GoogleReview {
  reviewId: string
  reviewer: string
  rating: number          // 1–5
  comment: string
  createTime: string
  replyText?: string      // existing reply if any
  replyTime?: string
}

export interface GoogleReviewsResult {
  reviews: GoogleReview[]
  error?: string
}

/**
 * Fetch latest reviews for a Google Business place.
 * Uses Google My Business API v4.
 */
export async function fetchGoogleReviews(
  placeId: string,
  apiKey: string
): Promise<GoogleReviewsResult> {
  try {
    // Google My Business API — requires OAuth in production
    // For now we use the Places API details endpoint (public rating) as a fallback
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`
    const res = await fetch(url)

    if (!res.ok) return { reviews: [], error: `Google API HTTP ${res.status}` }

    const data = await res.json()
    if (data.status !== 'OK') return { reviews: [], error: data.status }

    const rawReviews = data.result?.reviews ?? []
    const reviews: GoogleReview[] = rawReviews.map((r: any, i: number) => ({
      reviewId: `${placeId}_${i}_${r.time}`,
      reviewer: r.author_name ?? 'Anonymous',
      rating: r.rating ?? 0,
      comment: r.text ?? '',
      createTime: new Date(r.time * 1000).toISOString(),
    }))

    return { reviews }
  } catch (e: any) {
    return { reviews: [], error: e.message }
  }
}

/**
 * Post a reply to a Google review.
 * Requires Google My Business API OAuth (not Places API).
 * In production, route through PostFast which handles OAuth complexity.
 */
export async function replyGoogleReview(input: {
  placeId: string
  reviewId: string
  replyText: string
  accessToken: string    // Google OAuth token (managed by PostFast or direct)
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Google My Business Reply API
    const url = `https://mybusiness.googleapis.com/v4/accounts/-/locations/${input.placeId}/reviews/${input.reviewId}/reply`
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: input.replyText }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.error?.message ?? `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/**
 * Get place rating summary (for dashboard snapshot)
 */
export async function getPlaceRating(placeId: string, apiKey: string) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()
    return {
      rating: data.result?.rating ?? null,
      totalRatings: data.result?.user_ratings_total ?? null,
    }
  } catch {
    return { rating: null, totalRatings: null }
  }
}
