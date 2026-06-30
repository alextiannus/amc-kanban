/**
 * TikTok Content Posting Direct Integration Wrapper
 * Uses TikTok Developer API v2
 */

export interface TiktokPublishInput {
  accessToken: string
  title: string
  mediaUrl: string // Hosted URL of the mp4 video
}

export interface TiktokPublishResult {
  success: boolean
  postId?: string
  error?: string
}

export async function publishTiktokVideo(input: TiktokPublishInput): Promise<TiktokPublishResult> {
  try {
    const { accessToken, title, mediaUrl } = input

    // 1. Fetch video metadata (size) from the hosted mediaUrl
    const fileHead = await fetch(mediaUrl, { method: 'HEAD' })
    const videoSizeStr = fileHead.headers.get('content-length')
    if (!videoSizeStr) {
      return { success: false, error: 'Failed to retrieve video size from media URL' }
    }
    const videoSize = parseInt(videoSizeStr, 10)

    // 2. Initialize Direct Video Post
    const initUrl = 'https://open.tiktokapis.com/v2/post/publish/video/init/'
    const initPayload = {
      post_info: {
        title: title.slice(0, 150), // TikTok title limit is usually 150 characters
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_duet: false,
        disable_stitch: false,
        disable_comment: false,
        video_cover_timestamp_ms: 1000,
      },
      source_info: {
        source: 'FILE_UPLOAD',
        video_size: videoSize,
        chunk_size: videoSize, // Upload in a single chunk for simplicity
        total_chunk_count: 1,
      },
    }

    const initRes = await fetch(initUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify(initPayload),
    })

    const initData = await initRes.json()
    if (!initRes.ok) {
      return {
        success: false,
        error: initData.error?.message || `TikTok API Init failed with HTTP ${initRes.status}`,
      }
    }

    const { publish_id, upload_url } = initData.data

    // 3. Fetch video file binary and upload to the TikTok upload_url
    const fileRes = await fetch(mediaUrl)
    if (!fileRes.ok) {
      return { success: false, error: `Failed to download video file: HTTP ${fileRes.status}` }
    }
    const videoBuffer = await fileRes.arrayBuffer()

    const uploadRes = await fetch(upload_url, {
      method: 'PUT',
      headers: {
        'Content-Range': `bytes 0-${videoSize - 1}/${videoSize}`,
        'Content-Type': 'video/mp4',
      },
      body: videoBuffer,
    })

    if (!uploadRes.ok) {
      const uploadErrorText = await uploadRes.text().catch(() => '')
      return {
        success: false,
        error: `TikTok video chunk upload failed with HTTP ${uploadRes.status}: ${uploadErrorText}`,
      }
    }

    // Return publish_id as the postId to check status later
    return {
      success: true,
      postId: publish_id,
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown TikTok publish error',
    }
  }
}
