/**
 * PostFast Integration — Complete API wrapper
 * Covers: accounts, posts (CRUD + schedule), media upload, connect links, review replies.
 * Base URL: https://api.postfa.st
 * Auth: pf-api-key header
 */

import {
  blockingMediaIssues,
  inspectMediaFile,
  inspectMediaUrl,
  mediaValidationWarnings,
  mediaValidationResponse,
  type MediaTechnicalMetadata,
  type MediaValidationIssue,
  validatePlatformMedia,
} from '../mediaValidation.ts'

const POSTFAST_BASE = process.env.POSTFAST_BASE_URL || 'https://api.postfa.st'
const POSTFAST_PUBLISH_TOTAL_TIMEOUT_MS = 22_000
const POSTFAST_PREFLIGHT_TIMEOUT_MS = 15_000

type JsonRecord = Record<string, unknown>

function asObject(value: unknown): JsonRecord {
  return value && typeof value === 'object' ? (value as JsonRecord) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

interface PfFetchResult {
  ok: boolean
  status: number
  data: unknown
  error?: string
}

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
  // All Google Business Profile variants → canonical 'google'
  GOOGLE_BUSINESS:         'google',   // ← added: handles legacy DB records with platformId='google_business'
  GOOGLE_BUSINESS_PROFILE: 'google',
  GOOGLE_MY_BUSINESS:      'google',
  GOOGLEBUSINESS:          'google',   // ← added: no-underscore variant
  GOOGLEBUSINESSPROFILE:   'google',
  GOOGLEMYBUSINESS:        'google',
  GOOGLE_MAPS:             'google',
  GOOGLEMAPS:              'google',
}

function normalizePlatform(rawPlatform: unknown): string {
  const raw = String(rawPlatform ?? '')
  const upper = raw.toUpperCase().trim()
  const compact = upper.replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  const noUnderscore = compact.replace(/_/g, '')
  return PLATFORM_MAP[upper] ?? PLATFORM_MAP[compact] ?? PLATFORM_MAP[noUnderscore] ?? compact.toLowerCase()
}

function normalizeHandle(rawHandle: unknown): string {
  return String(rawHandle ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/^\/+|\/+$/g, '')
}

function normalizeScheduledAt(rawScheduledAt?: string): { value?: string; error?: string } {
  if (!rawScheduledAt) return {}
  const date = new Date(rawScheduledAt)
  if (Number.isNaN(date.getTime())) {
    return { error: '发布失败：scheduledAt 时间格式无效，请使用 ISO 时间或重新选择排期时间。' }
  }
  if (date.getTime() <= Date.now() + 60_000) {
    return { error: '发布失败：排期时间必须晚于当前时间至少 1 分钟。' }
  }
  return { value: date.toISOString() }
}

function normalizePostStatus(rawStatusInput: unknown): PostFastPost['status'] {
  const raw = asString(rawStatusInput).toLowerCase().trim()
  if (!raw) return 'draft'

  if (raw === 'published' || raw === 'posted' || raw === 'done' || raw === 'success') {
    return 'published'
  }

  if (raw === 'failed' || raw === 'error' || raw === 'cancelled' || raw === 'canceled') {
    return 'failed'
  }

  if (raw === 'scheduled' || raw === 'queued' || raw === 'queue' || raw === 'pending') {
    return 'scheduled'
  }

  return 'draft'
}

// ── Shared fetch helper ────────────────────────────────────────────────────

async function pfFetch(
  apiKey: string,
  path: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<PfFetchResult> {
  try {
    const res = await fetch(`${POSTFAST_BASE}${path}`, {
      ...options,
      headers: {
        'pf-api-key': apiKey,
        'Content-Type': 'application/json',
        ...(options.headers as Record<string, string> ?? {}),
      },
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    })
    let data: unknown = {}
    try { data = await res.json() } catch { /* plain-text response */ }
    if (!res.ok) {
      const obj = asObject(data)
      // PostFast may return errors as an array e.g. ["Maximum 15 posts...", "posts must be an array"]
      let errMsg: string
      if (Array.isArray(data)) {
        errMsg = data.map((item) => asString(item, String(item))).join(', ')
      } else if (Array.isArray(obj.errors)) {
        errMsg = obj.errors.map((item) => asString(item, String(item))).join(', ')
      } else {
        errMsg = asString(obj.message) || asString(obj.error) || `HTTP ${res.status}`
      }
      return { ok: false, status: res.status, data, error: errMsg }
    }
    return { ok: true, status: res.status, data }
  } catch (e: unknown) {
    return { ok: false, status: 0, data: null, error: e instanceof Error ? e.message : 'PostFast request failed' }
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
  mediaItems?: PostFastMediaInput[] // preferred: preserves MIME/type metadata
  mediaStorageKeys?: string[]   // keys from signed upload (preferred)
  mediaUrls?: string[]          // public URLs (fallback)
  hashtags?: string[]
  scheduledAt?: string          // ISO 8601 UTC
  accountId?: string            // specific account ID to post from
  gbpLocationId?: string         // required by PostFast for Google Business Profile posts
}

export interface PostFastMediaInput {
  storageKey?: string
  url?: string
  mimeType?: string
  type?: 'IMAGE' | 'VIDEO'
  filename?: string
  assetId?: string
  metadata?: MediaTechnicalMetadata
}

export interface PostFastPublishResult {
  success: boolean
  postId?: string
  url?: string
  scheduledAt?: string
  error?: string
  code?: string
  issues?: MediaValidationIssue[]
  warnings?: MediaValidationIssue[]
}

function remainingTimeout(deadlineAt: number, capMs: number) {
  return Math.max(1, Math.min(capMs, deadlineAt - Date.now()))
}

function postfastPublishTimeout(): PostFastPublishResult {
  return {
    success: false,
    code: 'POSTFAST_PUBLISH_TIMEOUT',
    error: '发布链路超时，未继续创建帖子，请稍后重试',
  }
}

// ── Account Management ─────────────────────────────────────────────────────

/**
 * GET /social-media/my-social-accounts
 * Fetch all connected social accounts for this PostFast workspace.
 */
export async function postfastFetchAccounts(apiKey: string, timeoutMs = 15_000): Promise<{
  success: boolean
  accounts: PostFastAccount[]
  error?: string
}> {
  const r = await pfFetch(apiKey, '/social-media/my-social-accounts', {}, timeoutMs)
  if (!r.ok) return { success: false, accounts: [], error: r.error }

  const raw: JsonRecord[] = Array.isArray(r.data) ? (r.data as JsonRecord[]) : []
  const accounts: PostFastAccount[] = raw.map(a => {
    const pfPlatform = String(a.platform ?? '').toUpperCase().trim()
    const followerCount = asNumber(a.followerCount)
    const followerDelta = asNumber(a.followerDelta)
    const ratingScore = asNumber(a.ratingScore)

    return {
      id: asString(a.id),
      platform: pfPlatform,
      platformId: normalizePlatform(a.platform),
      handle: asString(a.platformUsername) || asString(a.displayName) || asString(a.id),
      displayName: asString(a.displayName) || undefined,
      profileUrl: asString(a.profileUrl) || undefined,
      connected: a.isConnected !== false,
      followerCount,
      followerDelta,
      ratingScore,
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
  const obj = asObject(r.data)
  return {
    success: true,
    connectUrl: asString(obj.link) || asString(obj.url) || asString(obj.connectUrl) || undefined,
  }
}

/**
 * GET /social-media/:id/gbp-locations
 * Fetch Google Business Profile locations for an account.
 */
export async function postfastGetGBPLocations(apiKey: string, accountId: string, timeoutMs = 15_000): Promise<{
  success: boolean
  locations: Array<{ id: string; name: string; address?: string; placeId?: string }>
  error?: string
}> {
  const r = await pfFetch(apiKey, `/social-media/${accountId}/gbp-locations`, {}, timeoutMs)
  if (!r.ok) return { success: false, locations: [], error: r.error }
  const dataObj = asObject(r.data)
  const locSource = Array.isArray(r.data) ? (r.data as JsonRecord[]) : (Array.isArray(dataObj.locations) ? dataObj.locations as JsonRecord[] : [])
  const locs = locSource.map((l) => ({
    id: asString(l.locationId) || asString(l.gbpLocationId) || asString(l.id),
    name: asString(l.name) || asString(l.locationName),
    address: asString(l.address) || undefined,
    placeId: asString(l.placeId) || asString(l.googlePlaceId) || undefined,
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

  const raw: JsonRecord[] = Array.isArray(r.data)
    ? r.data as JsonRecord[]
    : (Array.isArray(asObject(r.data).data) ? asObject(r.data).data as JsonRecord[] : [])
  const posts: PostFastAnalyticsPost[] = raw.map(p => ({
    id: asString(p.id),
    content: asString(p.content),
    socialMediaId: asString(p.socialMediaId),
    platformPostId: asString(p.platformPostId),
    publishedAt: asString(p.publishedAt) || new Date().toISOString(),
    latestMetric: (p.latestMetric && typeof p.latestMetric === 'object') ? (p.latestMetric as PostFastAnalyticsPost['latestMetric']) : null,
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

  const dataObj = asObject(r.data)
  const rawPosts: JsonRecord[] = Array.isArray(r.data)
    ? r.data as JsonRecord[]
    : (Array.isArray(dataObj.data) ? dataObj.data as JsonRecord[] : (Array.isArray(dataObj.posts) ? dataObj.posts as JsonRecord[] : []))
  const posts: PostFastPost[] = rawPosts.map(p => {
    const pfPlatform = asString(p.platform).toUpperCase()
    const status = normalizePostStatus(p.status)

    const mediaItems = Array.isArray(p.mediaItems) ? (p.mediaItems as Array<{ url?: unknown }>) : []

    return {
      id: asString(p.id),
      platform: pfPlatform,
      platformId: normalizePlatform(p.platform),
      caption: asString(p.content) || asString(p.caption),   // API returns 'content', not 'caption'
      status,
      scheduledAt: asString(p.scheduledAt) || asString(p.scheduled_at) || undefined,
      publishedAt: asString(p.publishedAt) || asString(p.published_at) || undefined,
      postUrl: asString(p.url) || asString(p.postUrl) || undefined,
      mediaUrls: mediaItems.map((m) => m.url).filter((url): url is string => typeof url === 'string' && url.length > 0),
      hashtags: Array.isArray(p.hashtags) ? (p.hashtags as string[]) : [],
      // No engagement stats from this endpoint — use postfastGetAnalytics()
    }
  })
  const totalCount = asNumber(dataObj.totalCount)
  return { success: true, posts, total: totalCount ?? rawPosts.length }
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
}>, timeoutMs = 15_000): Promise<{ success: boolean; slots: PostFastUploadSlot[]; error?: string }> {
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
  const raw: JsonRecord[] = Array.isArray(r.data)
    ? r.data as JsonRecord[]
    : (() => {
        const dataObj = asObject(r.data)
        if (Array.isArray(dataObj.urls)) return dataObj.urls as JsonRecord[]
        if (Array.isArray(dataObj.files)) return dataObj.files as JsonRecord[]
        if (Array.isArray(dataObj.data)) return dataObj.data as JsonRecord[]
        return [] as JsonRecord[]
      })()
  const slots: PostFastUploadSlot[] = raw.map(s => ({
    uploadUrl: asString(s.uploadUrl) || asString(s.upload_url) || asString(s.signedUrl) || asString(s.signed_url) || asString(s.url),
    storageKey: asString(s.storageKey) || asString(s.storage_key) || asString(s.key) || asString(s.fileToken) || asString(s.file_token),
    fileToken: asString(s.fileToken) || asString(s.file_token) || asString(s.storageKey) || asString(s.storage_key),
    expiresAt: asString(s.expiresAt) || asString(s.expires_at) || undefined,
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
  mimeType: string,
  timeoutMs = 60_000,
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(signedUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: new Uint8Array(fileBuffer),   // Buffer → Uint8Array satisfies BodyInit
      signal: AbortSignal.timeout(Math.max(1, timeoutMs)),
    })
    if (!res.ok) return { success: false, error: `Upload HTTP ${res.status}` }
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Publish failed' }
  }
}

/**
 * POST /social-posts
 * Publish or schedule a post.
 * PostFast expects: { posts: [{ platform, caption, ... }] }
 */
function normalizeMimeType(value?: string | null): string {
  return String(value ?? '').split(';')[0].trim().toLowerCase()
}

function mimeExtension(mimeType: string): string {
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'video/mp4') return '.mp4'
  if (mimeType === 'video/quicktime') return '.mov'
  if (mimeType === 'video/webm') return '.webm'
  return '.jpg'
}

function inferMimeTypeFromExtension(filename: string): string {
  const normalized = filename.split('?')[0].toLowerCase()
  const ext = normalized.split('.').pop() || ''
  if (ext === 'png') return 'image/png'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'mov') return 'video/quicktime'
  if (ext === 'webm') return 'video/webm'
  return ''
}

function isGenericMimeType(mimeType: string): boolean {
  return !mimeType || mimeType === 'application/octet-stream' || mimeType === 'binary/octet-stream'
}

function detectMediaType(keyOrUrl: string, mimeType?: string | null, explicitType?: 'IMAGE' | 'VIDEO'): 'IMAGE' | 'VIDEO' {
  if (explicitType === 'VIDEO' || explicitType === 'IMAGE') return explicitType
  const normalizedMimeType = normalizeMimeType(mimeType)
  if (normalizedMimeType.startsWith('video/')) return 'VIDEO'
  if (normalizedMimeType.startsWith('image/')) return 'IMAGE'
  const normalized = keyOrUrl.split('?')[0].toLowerCase()
  if (normalized.startsWith('video/')) return 'VIDEO'
  if (normalized.startsWith('image/')) return 'IMAGE'
  const ext = normalized.split('.').pop() || ''
  if (['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'].includes(ext)) {
    return 'VIDEO'
  }
  return 'IMAGE'
}

async function uploadPublicUrlToPostfast(
  apiKey: string,
  url: string,
  mimeTypeHint: string | null | undefined,
  metadata: MediaTechnicalMetadata,
  deadlineAt: number,
): Promise<{
  storageKey: string
  mimeType: string
  filename: string
  metadata: MediaTechnicalMetadata
}> {
  let fileBuffer: Buffer
  let mimeType = normalizeMimeType(mimeTypeHint) || 'image/jpeg'
  let filename = 'file.jpg'

  if (url.startsWith('/') || !url.startsWith('http')) {
    const { readFile } = await import('node:fs/promises')
    const { join } = await import('node:path')
    const path = await import('node:path')
    const absolutePath = join(process.cwd(), 'public', url.split('?')[0])
    if (Date.now() >= deadlineAt) throw new Error('POSTFAST_PUBLISH_TIMEOUT')
    fileBuffer = await readFile(absolutePath)
    if (Date.now() >= deadlineAt) throw new Error('POSTFAST_PUBLISH_TIMEOUT')
    
    filename = path.basename(absolutePath)
    mimeType = normalizeMimeType(mimeTypeHint) || inferMimeTypeFromExtension(absolutePath) || 'image/jpeg'
  } else {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(remainingTimeout(deadlineAt, 8_000)),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const arrayBuffer = await res.arrayBuffer()
    fileBuffer = Buffer.from(arrayBuffer)

    const urlParts = url.split('/')
    filename = urlParts[urlParts.length - 1].split('?')[0] || 'file'
    const inferredMimeType = inferMimeTypeFromExtension(filename)
    const responseMimeType = normalizeMimeType(res.headers.get('content-type'))
    const hintedMimeType = normalizeMimeType(mimeTypeHint)
    if (hintedMimeType) {
      mimeType = hintedMimeType
    } else if (inferredMimeType && isGenericMimeType(responseMimeType)) {
      mimeType = inferredMimeType
    } else {
      mimeType = responseMimeType || inferredMimeType || 'image/jpeg'
    }
    if (!filename.includes('.')) {
      filename += mimeExtension(mimeType)
    }
  }

  mimeType = metadata.mimeType

  const signedResult = await postfastGetSignedUploadUrls(apiKey, [{
    filename,
    mimeType,
    sizeBytes: fileBuffer.length
  }], remainingTimeout(deadlineAt, 4_000))

  if (!signedResult.success || signedResult.slots.length === 0) {
    throw new Error(signedResult.error || 'Failed to get upload URL')
  }

  const slot = signedResult.slots[0]
  const uploadResult = await postfastUploadFile(
    slot.uploadUrl,
    fileBuffer,
    mimeType,
    remainingTimeout(deadlineAt, 8_000),
  )
  if (!uploadResult.success) {
    throw new Error(uploadResult.error || 'Upload failed')
  }

  return { storageKey: slot.storageKey, mimeType, filename, metadata }
}

function extractGoogleLocationId(rawHandle?: string | null): string {
  const handle = String(rawHandle ?? '').trim()
  if (!handle || handle === 'unconfigured') return ''
  const match = handle.match(/locations\/([^/?#]+)/)
  return match?.[1] ?? ''
}

async function resolveGbpLocationId(input: {
  apiKey: string
  socialMediaId: string
  requestedLocationId?: string
  accountHandle?: string | null
  deadlineAt: number
}): Promise<{ locationId?: string; error?: string }> {
  const wanted = input.requestedLocationId || extractGoogleLocationId(input.accountHandle)
  const locationsResult = await postfastGetGBPLocations(
    input.apiKey,
    input.socialMediaId,
    remainingTimeout(input.deadlineAt, 5_000),
  )
  if (!locationsResult.success) {
    return { error: `无法获取 PostFast Google Business locations: ${locationsResult.error || 'unknown error'}` }
  }
  if (locationsResult.locations.length === 0) {
    return { error: 'PostFast Google Business 账号没有同步到任何 location，请在 PostFast 重新连接或同步 GBP locations。' }
  }

  if (wanted) {
    const wantedNorm = normalizeHandle(wanted)
    const matched = locationsResult.locations.find((location) =>
      normalizeHandle(location.id) === wantedNorm ||
      normalizeHandle(location.placeId) === wantedNorm ||
      normalizeHandle(location.name).includes(wantedNorm)
    )
    if (matched) return { locationId: matched.id }
  }

  return { locationId: locationsResult.locations[0].id }
}

type PreparedPostFastMedia = PostFastMediaInput & {
  metadata: MediaTechnicalMetadata
}

function postfastStorageKey(item: PostFastMediaInput) {
  if (item.storageKey) return item.storageKey
  if (item.url?.startsWith('/api/integrations/postfast/file/')) {
    return item.url.split('?')[0].split('/').slice(6).join('/')
  }
  if (item.url && !item.url.startsWith('http') && !item.url.startsWith('/')) return item.url
  return ''
}

async function inspectPostfastMediaSource(
  item: PostFastMediaInput,
  storageKey: string,
  filename: string,
  deadlineAt: number,
) {
  if (storageKey) {
    const url = new URL(
      storageKey.replace(/^\/+/, ''),
      'https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/',
    ).toString()
    return inspectMediaUrl(url, {
      filename,
      mimeType: item.mimeType,
      deadlineAt,
    })
  }
  if (item.url?.startsWith('/')) {
    const { resolve, sep } = await import('node:path')
    const publicRoot = resolve(process.cwd(), 'public')
    const filePath = resolve(publicRoot, `.${item.url.split('?')[0]}`)
    if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
      throw { issues: [{
        filename,
        field: 'url',
        actual: item.url,
        limit: 'local public media path',
        message: '本地媒体路径无效，请重新上传',
      }] }
    }
    return inspectMediaFile(filePath, {
      filename,
      mimeType: item.mimeType,
      deadlineAt,
    })
  }
  return inspectMediaUrl(item.url || '', {
    filename,
    mimeType: item.mimeType,
    deadlineAt,
  })
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
) {
  const output = new Array<R>(values.length)
  let cursor = 0
  let firstError: unknown
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length && firstError === undefined) {
      const index = cursor
      cursor += 1
      try {
        output[index] = await mapper(values[index])
      } catch (error) {
        firstError ??= error
      }
    }
  })
  await Promise.all(workers)
  if (firstError) throw firstError
  return output
}

async function preparePostfastMedia(
  input: PostFastPublishInput,
  publishDeadlineAt: number,
): Promise<{
  items: PreparedPostFastMedia[]
  warnings: MediaValidationIssue[]
}> {
  const startedAt = Date.now()
  const preflightDeadlineAt = Math.min(
    publishDeadlineAt,
    startedAt + POSTFAST_PREFLIGHT_TIMEOUT_MS,
  )
  const candidates: PostFastMediaInput[] = [
    ...(input.mediaItems || []),
    ...(input.mediaStorageKeys || []).map((storageKey) => ({ storageKey })),
    ...(input.mediaUrls || []).map((url) => ({ url })),
  ]
  const unique: PostFastMediaInput[] = []
  const seen = new Set<string>()
  for (const candidate of candidates) {
    const key = postfastStorageKey(candidate)
    const identity = key ? `key:${key}` : candidate.url ? `url:${candidate.url}` : ''
    if (!identity || seen.has(identity)) continue
    seen.add(identity)
    unique.push(candidate)
  }

  const prepared = await mapWithConcurrency(unique, 3, async (item) => {
    if (item.metadata) return { ...item, metadata: item.metadata }
    const storageKey = postfastStorageKey(item)
    const filename = item.filename || (storageKey || item.url || 'unknown').split('/').pop() || 'unknown'
    const metadata = await inspectPostfastMediaSource(
      item,
      storageKey,
      filename,
      preflightDeadlineAt,
    )
    return {
      ...item,
      storageKey: storageKey || undefined,
      metadata,
    }
  })
  const issues = validatePlatformMedia(
    normalizePlatform(input.platform),
    prepared.map((item) => ({
      filename: item.filename || postfastStorageKey(item) || item.url || 'unknown',
      assetId: item.assetId,
      metadata: item.metadata,
    })),
  )
  const blockingIssues = blockingMediaIssues(issues)
  const warnings = mediaValidationWarnings(issues)
  if (blockingIssues.length > 0) {
    console.warn('[postfast-media-preflight] rejected', {
      platform: normalizePlatform(input.platform),
      fields: Array.from(new Set(blockingIssues.map((issue) => issue.field))),
      elapsedMs: Date.now() - startedAt,
    })
    throw { issues: blockingIssues }
  }
  console.info('[postfast-media-preflight] passed', {
    platform: normalizePlatform(input.platform),
    mediaCount: prepared.length,
    warningFields: Array.from(new Set(warnings.map((warning) => warning.field))),
    elapsedMs: Date.now() - startedAt,
  })
  return { items: prepared, warnings }
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
  const normalizedSchedule = normalizeScheduledAt(input.scheduledAt)
  if (normalizedSchedule.error) {
    return { success: false, error: normalizedSchedule.error }
  }
  const publishDeadlineAt = Date.now() + POSTFAST_PUBLISH_TOTAL_TIMEOUT_MS

  // Media preflight is intentionally first: no account lookup, upload, or PostFast post
  // creation may happen before every source has been inspected and platform-validated.
  let preparedMediaItems: PreparedPostFastMedia[]
  let mediaWarnings: MediaValidationIssue[] = []
  try {
    const prepared = await preparePostfastMedia(input, publishDeadlineAt)
    preparedMediaItems = prepared.items
    mediaWarnings = prepared.warnings
  } catch (error) {
    const response = mediaValidationResponse(error)
    return {
      success: false,
      code: response.code,
      error: response.error,
      issues: response.issues,
    }
  }
  if (publishDeadlineAt - Date.now() < 2_000) return postfastPublishTimeout()

  // 1. Fetch connected accounts from PostFast to resolve the PostFast account ID (socialMediaId)
  const { success: fetchSuccess, accounts, error: fetchError } = await postfastFetchAccounts(
    input.apiKey,
    remainingTimeout(publishDeadlineAt, 5_000),
  )
  if (!fetchSuccess) {
    if (Date.now() >= publishDeadlineAt - 250) return postfastPublishTimeout()
    return { success: false, error: `无法获取 PostFast 账号列表: ${fetchError}` }
  }

  let matchedAccount: PostFastAccount | undefined
  let dbAccountForPublish: { platformId: string; handle: string | null } | null = null

  if (input.accountId) {
    // Try matching PostFast account ID directly
    matchedAccount = accounts.find(a => a.id === input.accountId)

    // If not found, look up internal SocialAccount CUID in DB
    if (!matchedAccount) {
      try {
        const { prisma } = await import('@/lib/prisma')
        const dbAccount = await prisma.socialAccount.findUnique({
          where: { id: input.accountId },
          select: { platformId: true, handle: true },
        })
        if (dbAccount) {
          dbAccountForPublish = dbAccount
          const targetPlatformId = normalizePlatform(dbAccount.platformId)
          const targetHandle = normalizeHandle(dbAccount.handle)
          matchedAccount = accounts.find(a =>
            normalizePlatform(a.platformId) === targetPlatformId &&
            normalizeHandle(a.handle) === targetHandle
          )
        }
      } catch (e: unknown) {
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
  const isGoogleBusinessPost = normalizePlatform(input.platform) === 'google' || normalizePlatform(matchedAccount.platformId) === 'google'

  // 2. Resolve media keys (download & upload public URLs to S3 in the background)
  const resolvedMediaItems: Array<{
    key: string
    mimeType?: string
    type?: 'IMAGE' | 'VIDEO'
    filename?: string
    assetId?: string
    metadata?: MediaTechnicalMetadata
  }> = []
  const seenMediaKeys = new Set<string>()
  const pushResolvedMedia = (media: {
    key: string
    mimeType?: string
    type?: 'IMAGE' | 'VIDEO'
    filename?: string
    assetId?: string
    metadata?: MediaTechnicalMetadata
  }) => {
    if (!media.key || seenMediaKeys.has(media.key)) return
    seenMediaKeys.add(media.key)
    resolvedMediaItems.push(media)
  }

  if (preparedMediaItems.length > 0) {
    try {
      const uploadedItems = await Promise.all(preparedMediaItems.map(async (item) => {
        const storageKey = postfastStorageKey(item)
        if (storageKey) {
          return {
            key: storageKey,
            mimeType: item.mimeType,
            type: item.type,
            filename: item.filename,
            assetId: item.assetId,
            metadata: item.metadata,
          }
        }
        if (item.url) {
          const uploaded = await uploadPublicUrlToPostfast(
            input.apiKey,
            item.url,
            item.mimeType,
            item.metadata,
            publishDeadlineAt,
          )
          return {
            key: uploaded.storageKey,
            mimeType: uploaded.mimeType,
            type: item.type,
            filename: item.filename || uploaded.filename,
            assetId: item.assetId,
            metadata: item.metadata || uploaded.metadata,
          }
        }
        return null
      }))
      uploadedItems.forEach((item) => {
        if (item) pushResolvedMedia(item)
      })
    } catch (e: unknown) {
      if (
        Date.now() >= publishDeadlineAt - 250 ||
        (e instanceof Error && e.message === 'POSTFAST_PUBLISH_TIMEOUT')
      ) {
        return postfastPublishTimeout()
      }
      return { success: false, error: e instanceof Error ? `媒体文件上传失败: ${e.message}` : `媒体文件上传失败: ${String(e)}` }
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
  const requestControls: Record<string, unknown> = {}
  const isInstagramPost = normalizePlatform(input.platform) === 'instagram' ||
    normalizePlatform(matchedAccount.platformId) === 'instagram'
  if (
    isInstagramPost &&
    resolvedMediaItems.length === 1 &&
    detectMediaType(
      resolvedMediaItems[0].key,
      resolvedMediaItems[0].mimeType,
      resolvedMediaItems[0].type,
    ) === 'VIDEO'
  ) {
    requestControls.instagramPublishType = 'REEL'
  }

  if (isGoogleBusinessPost) {
    const resolvedLocation = await resolveGbpLocationId({
      apiKey: input.apiKey,
      socialMediaId,
      requestedLocationId: input.gbpLocationId,
      accountHandle: dbAccountForPublish?.handle,
      deadlineAt: publishDeadlineAt,
    })
    if (!resolvedLocation.locationId) {
      if (Date.now() >= publishDeadlineAt - 250) return postfastPublishTimeout()
      return { success: false, error: resolvedLocation.error || '发布失败：Google Business 缺少 gbpLocationId。' }
    }
    post.gbpLocationId = resolvedLocation.locationId
    requestControls.gbpLocationId = resolvedLocation.locationId
    post.controls = {
      ...(asObject(post.controls)),
      gbpLocationId: resolvedLocation.locationId,
    }
  }

  if (normalizedSchedule.value) {
    post.scheduledAt = normalizedSchedule.value
  }

  if (resolvedMediaItems.length > 0) {
    post.mediaItems = resolvedMediaItems.map((item, index) => ({
      key: item.key,
      type: detectMediaType(item.key, item.mimeType, item.type),
      sortOrder: index,
    }))
  }

  // PostFast requires the post(s) wrapped in a "posts" array (max 15 per request)
  const body = JSON.stringify({
    posts: [post],
    ...(Object.keys(requestControls).length > 0 ? { controls: requestControls } : {}),
  })
  console.log(`[postfastPublish] REQUEST body: ${body}`)

  const r = await pfFetch(input.apiKey, '/social-posts', {
    method: 'POST',
    body,
  }, remainingTimeout(publishDeadlineAt, 6_000))
  console.log(`[postfastPublish] RESPONSE ok=${r.ok} status=${r.status} data=${JSON.stringify(r.data).slice(0, 300)}`)
  if (!r.ok) {
    if (Date.now() >= publishDeadlineAt - 250) return postfastPublishTimeout()
    return { success: false, error: r.error }
  }

  // Response may be array of created posts or a single object
  const dataObj = asObject(r.data)
  const created = Array.isArray(r.data)
    ? r.data[0]
    : (Array.isArray(dataObj.posts) ? dataObj.posts[0] : r.data)
  const createdObj = asObject(created)

  return {
    success: true,
    postId: asString(createdObj.post_id) || asString(createdObj.id) || undefined,
    url: asString(createdObj.url) || asString(createdObj.postUrl) || undefined,
    scheduledAt: asString(createdObj.scheduledAt) || normalizedSchedule.value,
    warnings: mediaWarnings,
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
