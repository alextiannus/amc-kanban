/**
 * PostFast Integration — Complete API wrapper
 * Covers: accounts, posts (CRUD + schedule), media upload, connect links, review replies.
 * Base URL: https://api.postfa.st
 * Auth: pf-api-key header
 */

const POSTFAST_BASE = 'https://api.postfa.st'

// ── Platform name normalisation ────────────────────────────────────────────

const PLATFORM_MAP: Record<string, string> = {
  INSTAGRAM:      'instagram',
  TIKTOK:         'tiktok',
  FACEBOOK:       'facebook',
  YOUTUBE:        'youtube',
  X:              'x',
  TWITTER:        'x',
  LINKEDIN:       'linkedin',
  XIAOHONGSHU:    'xiaohongshu',
  BLUESKY:        'bluesky',
  THREADS:        'threads',
  PINTEREST:      'pinterest',
  SNAPCHAT:       'snapchat',
  TELEGRAM:       'telegram',
  GOOGLE:         'google',
  GBP:            'google',
  GMB:            'google',
  GOOGLE_BUSINESS_PROFILE: 'google',
  GOOGLE_MY_BUSINESS: 'google',
  GOOGLEBUSINESSPROFILE: 'google',
  GOOGLEMYBUSINESS: 'google',
  GOOGLE_MAPS: 'google',
  GOOGLEMAPS: 'google',
}

function normalizePlatform(rawPlatform: unknown): string {
  const raw = String(rawPlatform ?? '')
  const upper = raw.toUpperCase().trim()
  const compact = upper.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const noUnderscore = compact.replace(/_/g, '')
  return PLATFORM_MAP[upper] ?? PLATFORM_MAP[compact] ?? PLATFORM_MAP[noUnderscore] ?? compact.toLowerCase()
}

// ── Shared fetch helper ────────────────────────────────────────────────────

async function pfFetch(
  apiKey: string,
  path: string,
  options: RequestInit = {}
): Promise<{ ok: boolean; status: number; data: any; error?: string }> {
  try {
    const res = await fetch(`${POSTFAST_BASE}${path}`, {
      ...options,
      headers: {
        'pf-api-key': apiKey,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    })
    let data: any = {}
    try { data = await res.json() } catch { /* plain-text response */ }
    if (!res.ok) {
      // PostFast may return errors as an array e.g. ["Maximum 15 posts...", "posts must be an array"]
      let errMsg: string
      if (Array.isArray(data)) {
        errMsg = data.join(', ')
      } else if (Array.isArray(data?.errors)) {
        errMsg = data.errors.join(', ')
      } else {
        errMsg = data?.message ?? data?.error ?? `HTTP ${res.status}`
      }
      return { ok: false, status: res.status, data, error: errMsg }
    }
    return { ok: true, status: res.status, data }
  } catch (e: any) {
    return { ok: false, status: 0, data: null, error: e.message }
  }
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PostFastAccount {
  id: string
  platform: string      // raw PostFast platform e.g. "INSTAGRAM"
  platformId: string    // normalised e.g. "instagram"
  handle: string
  displayName?: string
  profileUrl?: string
  connected?: boolean
  followerCount?: number
  followerDelta?: number
  ratingScore?: number
}

export interface PostFastPost {
  id: string
  platform: string
  platformId: string
  caption: string    // mapped from API field 'content'
  status: 'scheduled' | 'published' | 'failed' | 'draft'
  scheduledAt?: string
  publishedAt?: string
  postUrl?: string
  mediaUrls?: string[]
  hashtags?: string[]
  engagementStats?: {
    likes?: number
    comments?: number
    shares?: number
    impressions?: number
    reach?: number
    clicks?: number
  }
}

// Analytics-specific type returned by GET /social-posts/analytics
export interface PostFastAnalyticsPost {
  id: string                 // PostFast post UUID
  content: string            // Post text content
  socialMediaId: string      // Account UUID
  platformPostId: string     // Native platform post ID
  publishedAt: string        // ISO datetime
  latestMetric: {
    likes: string            // All metrics returned as strings (bigint)
    comments: string
    shares: string
    impressions: string
    clicks: string
    reach: string
    extras: Record<string, string>
    fetchedAt: string
  } | null
}

export interface PostFastPublishInput {
  apiKey: string
  platform: string
  caption: string
  mediaStorageKeys?: string[]   // keys from signed upload (preferred)
  mediaUrls?: string[]          // public URLs (fallback)
  hashtags?: string[]
  scheduledAt?: string          // ISO 8601 UTC
  accountId?: string            // specific account ID to post from
}

export interface PostFastPublishResult {
  success: boolean
  postId?: string
  url?: string
  scheduledAt?: string
  error?: string
}

// ── Account Management ─────────────────────────────────────────────────────

/**
 * GET /social-media/my-social-accounts
 * Fetch all connected social accounts for this PostFast workspace.
 */
export async function postfastFetchAccounts(apiKey: string): Promise<{
  success: boolean
  accounts: PostFastAccount[]
  error?: string
}> {
  const r = await pfFetch(apiKey, '/social-media/my-social-accounts')
  if (!r.ok) return { success: false, accounts: [], error: r.error }

  const raw: any[] = Array.isArray(r.data) ? r.data : []
  const accounts: PostFastAccount[] = raw.map(a => {
    const pfPlatform = String(a.platform ?? '').toUpperCase().trim()
    return {
      id: a.id,
      platform: pfPlatform,
      platformId: normalizePlatform(a.platform),
      handle: a.platformUsername || a.displayName || a.id,
      displayName: a.displayName,
      profileUrl: a.profileUrl,
      connected: a.isConnected !== false,
      followerCount: a.followerCount != null ? parseInt(a.followerCount) : undefined,
      followerDelta: a.followerDelta != null ? parseInt(a.followerDelta) : undefined,
      ratingScore: a.ratingScore != null ? parseFloat(a.ratingScore) : undefined,
    }
  })
  return { success: true, accounts }
}

/**
 * POST /social-media/connect-link
 * Generate a secure link to let a client connect their social accounts.
 */
export async function postfastGenerateConnectLink(apiKey: string, options?: {
  label?: string
  redirectUrl?: string
}): Promise<{ success: boolean; connectUrl?: string; error?: string }> {
  const r = await pfFetch(apiKey, '/social-media/connect-link', {
    method: 'POST',
    body: JSON.stringify(options ?? {}),
  })
  if (!r.ok) return { success: false, error: r.error }
  return { success: true, connectUrl: r.data?.link ?? r.data?.url ?? r.data?.connectUrl }
}

/**
 * GET /social-media/:id/gbp-locations
 * Fetch Google Business Profile locations for an account.
 */
export async function postfastGetGBPLocations(apiKey: string, accountId: string): Promise<{
  success: boolean
  locations: Array<{ id: string; name: string; address?: string; placeId?: string }>
  error?: string
}> {
  const r = await pfFetch(apiKey, `/social-media/${accountId}/gbp-locations`)
  if (!r.ok) return { success: false, locations: [], error: r.error }
  const locs = (Array.isArray(r.data) ? r.data : r.data?.locations ?? []).map((l: any) => ({
    id: l.id ?? l.locationId,
    name: l.name ?? l.locationName,
    address: l.address,
    placeId: l.placeId ?? l.googlePlaceId,
  }))
  return { success: true, locations: locs }
}

/**
 * GET /social-posts/analytics
 * Fetch published posts with their latest performance metrics.
 * Only returns posts that have been successfully published (with a platformPostId).
 * Metrics are returned as strings (bigint) — parse to numbers before use.
 * No pagination — returns all matching posts in the date range.
 */
export async function postfastGetAnalytics(apiKey: string, options?: {
  startDate?: string   // ISO 8601, e.g. 2026-01-01T00:00:00.000Z
  endDate?: string     // ISO 8601, e.g. 2026-01-31T23:59:59.999Z
  socialMediaIds?: string[]  // Filter by specific account UUIDs
}): Promise<{ success: boolean; posts: PostFastAnalyticsPost[]; error?: string }> {
  const params = new URLSearchParams()
  if (options?.startDate) params.set('startDate', options.startDate)
  if (options?.endDate) params.set('endDate', options.endDate)
  if (options?.socialMediaIds?.length) params.set('socialMediaIds', options.socialMediaIds.join(','))

  const r = await pfFetch(apiKey, `/social-posts/analytics?${params}`)
  if (!r.ok) return { success: false, posts: [], error: r.error }

  const raw: any[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? [])
  const posts: PostFastAnalyticsPost[] = raw.map(p => ({
    id: p.id,
    content: p.content ?? '',
    socialMediaId: p.socialMediaId ?? '',
    platformPostId: p.platformPostId ?? '',
    publishedAt: p.publishedAt ?? new Date().toISOString(),
    latestMetric: p.latestMetric ?? null,
  }))
  return { success: true, posts }
}

/**
 * GET /social-posts
 * List scheduled / published posts with optional filters.
 * Note: does NOT include engagement metrics — use postfastGetAnalytics() for that.
 */
export async function postfastListPosts(apiKey: string, options?: {
  status?: 'scheduled' | 'published' | 'failed' | 'draft'
  platform?: string
  limit?: number
  page?: number
}): Promise<{ success: boolean; posts: PostFastPost[]; total?: number; error?: string }> {
  const params = new URLSearchParams()
  if (options?.status) params.set('statuses', options.status.toUpperCase())  // API expects uppercase
  if (options?.platform) params.set('platforms', options.platform.toUpperCase())
  if (options?.limit) params.set('limit', String(Math.min(options.limit, 50)))  // max 50 per request
  if (options?.page != null) params.set('page', String(options.page))

  const r = await pfFetch(apiKey, `/social-posts?${params}`)
  if (!r.ok) return { success: false, posts: [], error: r.error }

  const rawPosts: any[] = Array.isArray(r.data) ? r.data : (r.data?.data ?? r.data?.posts ?? [])
  const posts: PostFastPost[] = rawPosts.map(p => {
    const pfPlatform = (p.platform ?? '').toUpperCase()
    return {
      id: p.id,
      platform: pfPlatform,
      platformId: PLATFORM_MAP[pfPlatform] ?? pfPlatform.toLowerCase(),
      caption: p.content ?? p.caption ?? '',   // API returns 'content', not 'caption'
      status: p.status?.toLowerCase() ?? 'draft',
      scheduledAt: p.scheduledAt ?? p.scheduled_at,
      publishedAt: p.publishedAt ?? p.published_at,
      postUrl: p.url ?? p.postUrl,
      mediaUrls: (p.mediaItems ?? []).map((m: any) => m.url).filter(Boolean),
      hashtags: p.hashtags ?? [],
      // No engagement stats from this endpoint — use postfastGetAnalytics()
    }
  })
  return { success: true, posts, total: r.data?.totalCount ?? rawPosts.length }
}

/**
 * DELETE /social-posts/:id
 * Cancel and remove a scheduled post.
 */
export async function postfastDeletePost(apiKey: string, postId: string): Promise<{
  success: boolean
  error?: string
}> {
  const r = await pfFetch(apiKey, `/social-posts/${postId}`, { method: 'DELETE' })
  if (!r.ok) return { success: false, error: r.error }
  return { success: true }
}

// ── Media Upload (Signed URLs) ─────────────────────────────────────────────

export interface PostFastUploadSlot {
  uploadUrl: string        // PUT this URL with the file bytes
  storageKey: string       // pass this key in postfastPublish.mediaStorageKeys
  fileToken: string        // same as storageKey for reference
  expiresAt?: string
}

/**
 * POST /file/get-signed-upload-urls
 * Get signed S3 upload URLs. Upload files there, then pass storageKey to publish.
 * PostFast expects: { count: N, contentType: "image/jpeg" }
 */
export async function postfastGetSignedUploadUrls(apiKey: string, files: Array<{
  filename: string
  mimeType: string
  sizeBytes: number
}>): Promise<{ success: boolean; slots: PostFastUploadSlot[]; error?: string }> {
  // PostFast API accepts one contentType per batch — use the first file's mime type
  const firstMime = files[0]?.mimeType ?? 'image/jpeg'
  const r = await pfFetch(apiKey, '/file/get-signed-upload-urls', {
    method: 'POST',
    body: JSON.stringify({
      count: files.length,
      contentType: firstMime,
    }),
  })
  if (!r.ok) return { success: false, slots: [], error: r.error }

  // Response may be array directly or nested under urls/files/data key
  const raw: any[] = Array.isArray(r.data) ? r.data : (r.data?.urls ?? r.data?.files ?? r.data?.data ?? [])
  const slots: PostFastUploadSlot[] = raw.map(s => ({
    uploadUrl: s.uploadUrl ?? s.upload_url ?? s.signedUrl ?? s.signed_url ?? s.url,
    storageKey: s.storageKey ?? s.storage_key ?? s.key ?? s.fileToken ?? s.file_token,
    fileToken: s.fileToken ?? s.file_token ?? s.storageKey ?? s.storage_key,
    expiresAt: s.expiresAt ?? s.expires_at,
  }))
  return { success: true, slots }
}

/**
 * Upload a file buffer to PostFast using a signed URL.
 * Returns the storageKey to use in postfastPublish.
 */
export async function postfastUploadFile(
  signedUploadUrl: string,
  fileBuffer: Buffer,
  mimeType: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(signedUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: new Uint8Array(fileBuffer),   // Buffer → Uint8Array satisfies BodyInit
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) return { success: false, error: `Upload HTTP ${res.status}` }
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/**
 * POST /social-posts
 * Publish or schedule a post.
 * PostFast expects: { posts: [{ platform, caption, ... }] }
 */
function detectMediaType(keyOrUrl: string): 'IMAGE' | 'VIDEO' {
  const ext = keyOrUrl.split('?')[0].split('.').pop()?.toLowerCase() || ''
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) {
    return 'VIDEO'
  }
  return 'IMAGE'
}

async function uploadPublicUrlToPostfast(apiKey: string, url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const arrayBuffer = await res.arrayBuffer()
  const fileBuffer = Buffer.from(arrayBuffer)

  let mimeType = res.headers.get('content-type') || 'image/jpeg'
  mimeType = mimeType.split(';')[0].trim()

  const urlParts = url.split('/')
  let filename = urlParts[urlParts.length - 1].split('?')[0] || 'file'
  if (!filename.includes('.')) {
    if (mimeType.startsWith('image/png')) filename += '.png'
    else if (mimeType.startsWith('image/gif')) filename += '.gif'
    else if (mimeType.startsWith('video/mp4')) filename += '.mp4'
    else filename += '.jpg'
  }

  const signedResult = await postfastGetSignedUploadUrls(apiKey, [{
    filename,
    mimeType,
    sizeBytes: fileBuffer.length
  }])

  if (!signedResult.success || signedResult.slots.length === 0) {
    throw new Error(signedResult.error || 'Failed to get upload URL')
  }

  const slot = signedResult.slots[0]
  const uploadResult = await postfastUploadFile(slot.uploadUrl, fileBuffer, mimeType)
  if (!uploadResult.success) {
    throw new Error(uploadResult.error || 'Upload failed')
  }

  return slot.storageKey
}

/**
 * POST /social-posts
 * Publish or schedule a post.
 * PostFast expects: { posts: [{ socialMediaId, content, mediaItems: [...] }] }
 */
export async function postfastPublish(input: PostFastPublishInput): Promise<PostFastPublishResult> {
  // Guard: caption must be a non-empty string
  if (!input.caption || typeof input.caption !== 'string' || input.caption.trim() === '') {
    return { success: false, error: '发布失败：caption（正文）不能为空' }
  }
  // Guard: platform must be resolvable
  if (!input.platform || typeof input.platform !== 'string') {
    return { success: false, error: '发布失败：platform 未指定' }
  }

  // 1. Fetch connected accounts from PostFast to resolve the PostFast account ID (socialMediaId)
  const { success: fetchSuccess, accounts, error: fetchError } = await postfastFetchAccounts(input.apiKey)
  if (!fetchSuccess) {
    return { success: false, error: `无法获取 PostFast 账号列表: ${fetchError}` }
  }

  let matchedAccount: PostFastAccount | undefined

  if (input.accountId) {
    // Try matching PostFast account ID directly
    matchedAccount = accounts.find(a => a.id === input.accountId)

    // If not found, look up internal SocialAccount CUID in DB
    if (!matchedAccount) {
      try {
        const { prisma } = await import('@/lib/prisma')
        const dbAccount = await prisma.socialAccount.findUnique({
          where: { id: input.accountId }
        })
        if (dbAccount) {
          const targetPlatformId = dbAccount.platformId.toLowerCase()
          const targetHandle = dbAccount.handle.toLowerCase()
          matchedAccount = accounts.find(a =>
            a.platformId.toLowerCase() === targetPlatformId &&
            a.handle.toLowerCase() === targetHandle
          )
        }
      } catch (e: any) {
        console.error('Failed to look up social account in database:', e)
      }
    }
  }

  // Fallback: match by platform name
  if (!matchedAccount) {
    const targetPlatformId = normalizePlatform(input.platform)
    matchedAccount = accounts.find(a => a.platformId.toLowerCase() === targetPlatformId.toLowerCase())
  }

  if (!matchedAccount) {
    return {
      success: false,
      error: `发布失败：未在 PostFast 中找到匹配 ${input.platform} 的社交账号，请先连接账号。`,
    }
  }

  const socialMediaId = matchedAccount.id

  // 2. Resolve media keys (download & upload public URLs to S3 in the background)
  const mediaKeys: string[] = []

  if (input.mediaStorageKeys && input.mediaStorageKeys.length > 0) {
    mediaKeys.push(...input.mediaStorageKeys)
  }

  if (input.mediaUrls && input.mediaUrls.length > 0) {
    for (const url of input.mediaUrls) {
      try {
        const storageKey = await uploadPublicUrlToPostfast(input.apiKey, url)
        mediaKeys.push(storageKey)
      } catch (e: any) {
        return { success: false, error: `媒体文件上传失败 (${url}): ${e.message}` }
      }
    }
  }

  // 3. Construct post body for PostFast
  let content = input.caption.trim()
  if (input.hashtags && input.hashtags.length > 0) {
    const hashtagStr = input.hashtags.map(h => h.startsWith('#') ? h : `#${h}`).join(' ')
    content = `${content}\n\n${hashtagStr}`
  }

  const post: Record<string, unknown> = {
    socialMediaId,
    content,
  }

  if (input.scheduledAt) {
    post.scheduledAt = input.scheduledAt
  }

  if (mediaKeys.length > 0) {
    post.mediaItems = mediaKeys.map((key, index) => ({
      key,
      type: detectMediaType(key),
      sortOrder: index,
    }))
  }

  // PostFast requires the post(s) wrapped in a "posts" array (max 15 per request)
  const body = JSON.stringify({ posts: [post] })

  const r = await pfFetch(input.apiKey, '/social-posts', {
    method: 'POST',
    body,
  })
  if (!r.ok) return { success: false, error: r.error }

  // Response may be array of created posts or a single object
  const created = Array.isArray(r.data) ? r.data[0] : (r.data?.posts?.[0] ?? r.data)
  return {
    success: true,
    postId: created?.post_id ?? created?.id,
    url: created?.url ?? created?.postUrl,
    scheduledAt: input.scheduledAt,
  }
}

// ── Review Replies ─────────────────────────────────────────────────────────

/**
 * POST /reviews/reply
 * Reply to a Google or Yelp review via PostFast.
 */
export async function postfastReplyReview(input: {
  apiKey: string
  platform: 'google' | 'yelp'
  reviewId: string
  replyText: string
}): Promise<{ success: boolean; error?: string }> {
  const r = await pfFetch(input.apiKey, '/reviews/reply', {
    method: 'POST',
    body: JSON.stringify({
      platform: input.platform,
      review_id: input.reviewId,
      reply: input.replyText,
    }),
  })
  if (!r.ok) return { success: false, error: r.error }
  return { success: true }
}

// ── Connection Test ────────────────────────────────────────────────────────

/**
 * Validate an API key by fetching the account list.
 * Returns success + account count on success.
 */
export async function postfastTestConnection(apiKey: string): Promise<{
  success: boolean
  accountCount?: number
  error?: string
}> {
  const r = await postfastFetchAccounts(apiKey)
  if (!r.success) return { success: false, error: r.error }
  return { success: true, accountCount: r.accounts.length }
}
