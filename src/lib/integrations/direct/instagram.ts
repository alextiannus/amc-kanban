/**
 * Instagram Business & Creator Direct Integration Wrapper
 * Uses Meta Graph Instagram API
 */

export interface InstagramPublishInput {
  accessToken: string
  instagramBusinessId: string
  content: string
  mediaUrl: string
  isVideo?: boolean
}

export interface InstagramPublishResult {
  success: boolean
  postId?: string
  error?: string
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function publishInstagramPost(input: InstagramPublishInput): Promise<InstagramPublishResult> {
  try {
    const { accessToken, instagramBusinessId, content, mediaUrl, isVideo = false } = input

    // 1. Create Media Container
    const containerUrl = `https://graph.facebook.com/v20.0/${instagramBusinessId}/media`
    const containerPayload: Record<string, any> = {
      caption: content,
      access_token: accessToken,
    }

    if (isVideo) {
      containerPayload.media_type = 'REELS'
      containerPayload.video_url = mediaUrl
    } else {
      containerPayload.image_url = mediaUrl
    }

    const containerRes = await fetch(containerUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(containerPayload),
    })

    const containerData = await containerRes.json()
    if (!containerRes.ok) {
      return {
        success: false,
        error: containerData.error?.message || `Instagram Container creation failed with HTTP ${containerRes.status}`,
      }
    }

    const containerId = containerData.id

    // 2. Poll Container Status until FINISHED
    let attempts = 0
    const maxAttempts = 30 // Wait up to 5 minutes for video encoding
    let status = 'IN_PROGRESS'

    while (attempts < maxAttempts) {
      await sleep(10000) // Poll every 10 seconds
      attempts++

      const statusRes = await fetch(`https://graph.facebook.com/v20.0/${containerId}?fields=status_code&access_token=${accessToken}`)
      if (!statusRes.ok) {
        continue // Ignore transient errors and keep polling
      }

      const statusData = await statusRes.json()
      status = statusData.status_code

      if (status === 'FINISHED') {
        break
      } else if (status === 'ERROR') {
        return {
          success: false,
          error: `Instagram media container compilation failed: ${statusData.error_message || 'Video processing error'}`,
        }
      }
    }

    if (status !== 'FINISHED') {
      return {
        success: false,
        error: 'Instagram media container compilation timed out.',
      }
    }

    // 3. Publish Container
    const publishUrl = `https://graph.facebook.com/v20.0/${instagramBusinessId}/media_publish`
    const publishRes = await fetch(publishUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    })

    const publishData = await publishRes.json()
    if (!publishRes.ok) {
      return {
        success: false,
        error: publishData.error?.message || `Instagram publishing failed with HTTP ${publishRes.status}`,
      }
    }

    return {
      success: true,
      postId: publishData.id,
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown Instagram publish error',
    }
  }
}

export async function deleteInstagramPost(accessToken: string, postId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const url = `https://graph.facebook.com/v20.0/${postId}?access_token=${accessToken}`
    const res = await fetch(url, {
      method: 'DELETE',
    })

    const data = await res.json()
    if (!res.ok) {
      return {
        success: false,
        error: data.error?.message || `Instagram API HTTP ${res.status}`,
      }
    }

    return { success: true }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown Instagram delete error',
    }
  }
}
