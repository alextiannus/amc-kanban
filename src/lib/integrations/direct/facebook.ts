/**
 * Facebook Pages Direct Integration Wrapper
 * Uses Meta Graph Pages API
 */

export interface FacebookPublishInput {
  accessToken: string // Page Access Token
  pageId: string
  content: string
  mediaUrls?: string[]
  linkUrl?: string
}

export interface FacebookPublishResult {
  success: boolean
  postId?: string
  error?: string
}

export async function publishFacebookPost(input: FacebookPublishInput): Promise<FacebookPublishResult> {
  try {
    const { accessToken, pageId, content, mediaUrls = [], linkUrl } = input

    // If we have photos, we upload to /photos endpoint. If multiple, for simplicity we publish one photo or fallback.
    // Meta supports posting up to 1 photo directly via /photos. For multiple photos, a multi-photo post requires creating media containers first (similar to IG) or posting them and linking them.
    // For general social posting, let's support both single photo post and standard feed post.
    if (mediaUrls.length > 0) {
      const url = `https://graph.facebook.com/v20.0/${pageId}/photos`
      const payload: Record<string, any> = {
        url: mediaUrls[0],
        caption: content,
        access_token: accessToken,
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) {
        return {
          success: false,
          error: data.error?.message || `Facebook API HTTP ${res.status}`,
        }
      }

      return {
        success: true,
        postId: data.post_id || data.id,
      }
    }

    // Default text/link feed post
    const url = `https://graph.facebook.com/v20.0/${pageId}/feed`
    const payload: Record<string, any> = {
      message: content,
      access_token: accessToken,
    }

    if (linkUrl) {
      payload.link = linkUrl
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || `Facebook API HTTP ${res.status}`,
      }
    }

    return {
      success: true,
      postId: data.id,
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown Facebook publish error',
    }
  }
}

export async function deleteFacebookPost(accessToken: string, postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v20.0/${postId}?access_token=${accessToken}`
    const res = await fetch(url, {
      method: 'DELETE',
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || `Facebook API HTTP ${res.status}`,
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown Facebook delete error',
    }
  }
}
