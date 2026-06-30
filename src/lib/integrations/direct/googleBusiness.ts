/**
 * Google Business Profile Direct Integration Wrapper
 * Uses Google My Business API v1 & localPosts API
 */

export interface GbpPublishInput {
  accessToken: string
  locationName: string // e.g. "accounts/1234/locations/5678"
  content: string
  mediaUrls?: string[]
  actionUrl?: string
}

export interface GbpPublishResult {
  success: boolean
  postId?: string
  error?: string
}

export async function publishGbpLocalPost(input: GbpPublishInput): Promise<GbpPublishResult> {
  try {
    const { accessToken, locationName, content, mediaUrls = [], actionUrl } = input
    const url = `https://mybusinesslocalpost.googleapis.com/v1/${locationName}/localPosts`

    const payload: Record<string, any> = {
      languageCode: 'zh-CN',
      summary: content,
    }

    if (actionUrl) {
      payload.callToAction = {
        actionType: 'LEARN_MORE',
        url: actionUrl,
      }
    }

    if (mediaUrls.length > 0) {
      payload.media = mediaUrls.map(mediaUrl => ({
        mediaFormat: 'PHOTO',
        sourceUrl: mediaUrl,
      }))
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || `GBP API HTTP ${res.status}`,
      }
    }

    return {
      success: true,
      postId: data.name, // Format: accounts/1234/locations/5678/localPosts/9999
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown GBP publish error',
    }
  }
}

export async function deleteGbpLocalPost(accessToken: string, postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://mybusinesslocalpost.googleapis.com/v1/${postId}`
    const res = await fetch(url, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return {
        success: false,
        error: data.error?.message || `GBP API HTTP ${res.status}`,
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown GBP delete error',
    }
  }
}

export async function replyGbpReview(input: {
  accessToken: string
  locationName: string
  reviewId: string
  replyText: string
}): Promise<{ success: boolean; error?: string }> {
  try {
    const { accessToken, locationName, reviewId, replyText } = input
    const url = `https://mybusinessreviews.googleapis.com/v1/${locationName}/reviews/${reviewId}/reply`

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: replyText }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      return {
        success: false,
        error: data.error?.message || `GBP API HTTP ${res.status}`,
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown GBP reply error',
    }
  }
}
