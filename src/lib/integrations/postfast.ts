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
  connectionStatus: PostFastConnectionStatus
  disabledReason?: string
  inboxCapable: boolean
  followerCountUpdatedAt?: string
}

export type PostFastConnectionStatus = 'CONNECTED' | 'DISCONNECTED' | 'EXPIRED' | 'DISABLED' | 'UNKNOWN'
export type PostFastInstagramPublishType = 'TIMELINE' | 'REEL' | 'STORY'
export type PostFastTrialReelStrategy = 'SS_PERFORMANCE'
export type PostFastGbpTopicType = 'STANDARD' | 'EVENT' | 'OFFER'
export type PostFastGbpCallToAction = 'BOOK' | 'ORDER' | 'SHOP' | 'LEARN_MORE' | 'SIGN_UP' | 'CALL'

export interface PostFastFollowerHistoryPoint {
  capturedAt: string
  followerCount: number
}

export interface PostFastPlace {
  id: string
  name: string
  address?: string
}

export interface PostFastTikTokSound {
  musicSoundId: string
  name: string
  authorName?: string
}

export type PostFastDraftControls = Pick<PostFastPublishInput,
  'firstComment' | 'instagramLocationId' | 'instagramLocationDisplayName' |
  'instagramIsAiGenerated' | 'instagramPostToGrid' | 'instagramTrialReelStrategy' |
  'tiktokMusicSoundId' | 'tiktokMusicSoundName' | 'tiktokAutoAddMusic' |
  'gbpTopicType' | 'gbpCallToActionType' | 'gbpCallToActionUrl' | 'gbpEventTitle' |
  'gbpEventStartDate' | 'gbpEventEndDate' | 'gbpOfferCouponCode' | 'gbpOfferRedeemUrl' | 'gbpOfferTerms'
>

export interface PostFastPost {
  id: string
  socialMediaId?: string
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

export interface PostFastInboxConversation {
  id: string
  socialMediaId?: string
  platform: string
  status?: string
  subject?: string
  participantName?: string
  unreadCount: number
  needsAttention: boolean
  lastMessageAt?: string
  raw: JsonRecord
}

export interface PostFastInboxItem {
  id: string
  conversationId?: string
  authorName?: string
  body?: string
  direction?: string
  state?: string
  unread: boolean
  canReply: boolean
  canPrivateReply: boolean
  maxReplyLength?: number
  maxPrivateReplyLengthBytes?: number
  replyWindowEndsAt?: string
  raw: JsonRecord
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
  instagramPublishType?: PostFastInstagramPublishType
  caption: string
  mediaItems?: PostFastMediaInput[] // preferred: preserves MIME/type metadata
  coverImage?: PostFastMediaInput    // optional custom cover; image posts use it as the first media item
  mediaStorageKeys?: string[]   // keys from signed upload (preferred)
  mediaUrls?: string[]          // public URLs (fallback)
  hashtags?: string[]
  scheduledAt?: string          // ISO 8601 UTC
  accountId?: string            // specific account ID to post from
  gbpLocationId?: string         // required by PostFast for Google Business Profile posts
  firstComment?: string
  instagramLocationId?: string
  instagramLocationDisplayName?: string // UI-only metadata; never sent to PostFast
  instagramIsAiGenerated?: boolean
  instagramPostToGrid?: boolean
  instagramTrialReelStrategy?: PostFastTrialReelStrategy
  tiktokMusicSoundId?: string
  tiktokMusicSoundName?: string // UI-only metadata; never sent to PostFast
  tiktokAutoAddMusic?: boolean
  gbpTopicType?: PostFastGbpTopicType
  gbpCallToActionType?: PostFastGbpCallToAction
  gbpCallToActionUrl?: string
  gbpEventTitle?: string
  gbpEventStartDate?: string
  gbpEventEndDate?: string
  gbpOfferCouponCode?: string
  gbpOfferRedeemUrl?: string
  gbpOfferTerms?: string
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

export function sanitizePostFastDraftControls(value: unknown): { controls?: PostFastDraftControls; error?: string } {
  if (value === undefined || value === null) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'postfastControls must be an object' }
  const input = value as Record<string, unknown>
  const allowed = new Set([
    'firstComment', 'instagramLocationId', 'instagramLocationDisplayName', 'instagramIsAiGenerated',
    'instagramPostToGrid', 'instagramTrialReelStrategy', 'tiktokMusicSoundId', 'tiktokMusicSoundName',
    'tiktokAutoAddMusic', 'gbpTopicType', 'gbpCallToActionType', 'gbpCallToActionUrl', 'gbpEventTitle',
    'gbpEventStartDate', 'gbpEventEndDate', 'gbpOfferCouponCode', 'gbpOfferRedeemUrl', 'gbpOfferTerms',
  ])
  if (Object.keys(input).some((key) => !allowed.has(key))) return { error: 'postfastControls contains an unsupported field' }
  const controls: Record<string, unknown> = {}
  for (const key of ['firstComment', 'instagramLocationId', 'instagramLocationDisplayName', 'tiktokMusicSoundId', 'tiktokMusicSoundName', 'gbpCallToActionUrl', 'gbpEventTitle', 'gbpEventStartDate', 'gbpEventEndDate', 'gbpOfferCouponCode', 'gbpOfferRedeemUrl', 'gbpOfferTerms']) {
    const field = input[key]
    if (field !== undefined) {
      if (typeof field !== 'string' || !field.trim()) return { error: `postfastControls.${key} must be a non-empty string` }
      controls[key] = field.trim()
    }
  }
  for (const key of ['instagramIsAiGenerated', 'instagramPostToGrid', 'tiktokAutoAddMusic']) {
    const field = input[key]
    if (field !== undefined) {
      if (typeof field !== 'boolean') return { error: `postfastControls.${key} must be boolean` }
      controls[key] = field
    }
  }
  if (input.instagramTrialReelStrategy !== undefined) {
    if (input.instagramTrialReelStrategy !== 'SS_PERFORMANCE') return { error: 'postfastControls.instagramTrialReelStrategy is invalid' }
    controls.instagramTrialReelStrategy = input.instagramTrialReelStrategy
  }
  if (input.gbpTopicType !== undefined) {
    if (!['STANDARD', 'EVENT', 'OFFER'].includes(String(input.gbpTopicType))) return { error: 'postfastControls.gbpTopicType is invalid' }
    controls.gbpTopicType = input.gbpTopicType
  }
  if (input.gbpCallToActionType !== undefined) {
    if (!['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'].includes(String(input.gbpCallToActionType))) return { error: 'postfastControls.gbpCallToActionType is invalid' }
    controls.gbpCallToActionType = input.gbpCallToActionType
  }
  return { controls: controls as PostFastDraftControls }
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

function normalizeConnectionStatus(value: unknown, connected: boolean): PostFastConnectionStatus {
  const status = asString(value).toUpperCase().trim()
  if (status === 'CONNECTED' || status === 'DISCONNECTED' || status === 'EXPIRED' || status === 'DISABLED') return status
  return connected ? 'CONNECTED' : 'DISCONNECTED'
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

    const connected = a.isConnected !== false
    return {
      id: asString(a.id),
      platform: pfPlatform,
      platformId: normalizePlatform(a.platform),
      handle: asString(a.platformUsername) || asString(a.displayName) || asString(a.id),
      displayName: asString(a.displayName) || undefined,
      profileUrl: asString(a.profileUrl) || undefined,
      connected,
      followerCount,
      followerDelta,
      ratingScore,
      connectionStatus: normalizeConnectionStatus(a.connectionStatus ?? a.status, connected),
      disabledReason: asString(a.disabledReason) || undefined,
      inboxCapable: a.inboxCapable === true,
      followerCountUpdatedAt: asString(a.followerCountUpdatedAt) || undefined,
    }
  })
  return { success: true, accounts }
}

/** GET /social-media/:id/follower-history */
export async function postfastGetFollowerHistory(apiKey: string, accountId: string, timeoutMs = 15_000): Promise<{
  success: boolean
  history: PostFastFollowerHistoryPoint[]
  error?: string
}> {
  const r = await pfFetch(apiKey, `/social-media/${encodeURIComponent(accountId)}/follower-history`, {}, timeoutMs)
  if (!r.ok) return { success: false, history: [], error: r.error }
  const data = asObject(r.data)
  const rows = Array.isArray(r.data) ? r.data : Array.isArray(data.series) ? data.series : []
  const history = rows.flatMap((row): PostFastFollowerHistoryPoint[] => {
    const point = asObject(row)
    const followerCount = asNumber(point.followerCount ?? point.count)
    const capturedAt = asString(point.capturedAt) || asString(point.recordedAt) || asString(point.date)
    return followerCount === undefined || !capturedAt ? [] : [{ followerCount, capturedAt }]
  })
  return { success: true, history }
}

/** GET /social-media/:id/places?query= */
export async function postfastSearchPlaces(apiKey: string, query: string, timeoutMs = 15_000): Promise<{
  success: boolean
  places: PostFastPlace[]
  error?: string
}> {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) return { success: false, places: [], error: 'query is required' }
  const r = await pfFetch(apiKey, `/social-media/search-places?q=${encodeURIComponent(trimmedQuery)}`, {}, timeoutMs)
  if (!r.ok) return { success: false, places: [], error: r.error }
  const data = asObject(r.data)
  const rows = Array.isArray(r.data) ? r.data : Array.isArray(data.places) ? data.places : Array.isArray(data.data) ? data.data : []
  return { success: true, places: rows.flatMap((row): PostFastPlace[] => {
    const place = asObject(row)
    const id = asString(place.id) || asString(place.locationId)
    const name = asString(place.name) || asString(place.displayName)
    const address = asString(place.address) || undefined
    return id && name ? [{ id, name, ...(address ? { address } : {}) }] : []
  }) }
}

/** GET /social-media/:id/tiktok-sounds */
export async function postfastGetTikTokSounds(apiKey: string, accountId: string, timeoutMs = 15_000): Promise<{
  success: boolean
  sounds: PostFastTikTokSound[]
  error?: string
}> {
  const r = await pfFetch(apiKey, `/social-media/${encodeURIComponent(accountId)}/tiktok-sounds`, {}, timeoutMs)
  if (!r.ok) return { success: false, sounds: [], error: r.error }
  const data = asObject(r.data)
  const rows = Array.isArray(r.data) ? r.data : Array.isArray(data.sounds) ? data.sounds : Array.isArray(data.data) ? data.data : []
  return { success: true, sounds: rows.flatMap((row): PostFastTikTokSound[] => {
    const sound = asObject(row)
    const musicSoundId = asString(sound.musicSoundId)
    const name = asString(sound.name) || asString(sound.title)
    return musicSoundId && name ? [{ musicSoundId, name, authorName: asString(sound.artist) || undefined }] : []
  }) }
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
 * Resolve an internal SocialAccount ID to the matching PostFast Google account,
 * then return its GBP locations. A platform-only fallback is allowed only when
 * the PostFast workspace contains exactly one Google account.
 */
export async function postfastGetGBPLocationsForInternalAccount(
  apiKey: string,
  internalAccountId: string,
  timeoutMs = 15_000,
): Promise<{
  success: boolean
  locations: Array<{ id: string; name: string; address?: string; placeId?: string }>
  socialMediaId?: string
  error?: string
}> {
  const accountsResult = await postfastFetchAccounts(apiKey, timeoutMs)
  if (!accountsResult.success) {
    return { success: false, locations: [], error: accountsResult.error || 'Unable to load PostFast accounts.' }
  }

  let matchedAccount = accountsResult.accounts.find((account) => account.id === internalAccountId)
  if (!matchedAccount) {
    try {
      const { prisma } = await import('@/lib/prisma')
      const dbAccount = await prisma.socialAccount.findUnique({
        where: { id: internalAccountId },
        select: { platformId: true, handle: true },
      })
      if (!dbAccount || normalizePlatform(dbAccount.platformId) !== 'google') {
        return { success: false, locations: [], error: 'The selected social account is not a Google Business account.' }
      }
      const targetHandle = normalizeHandle(dbAccount.handle)
      matchedAccount = accountsResult.accounts.find((account) =>
        normalizePlatform(account.platformId) === 'google' &&
        targetHandle &&
        normalizeHandle(account.handle) === targetHandle
      )
    } catch (error: unknown) {
      return {
        success: false,
        locations: [],
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  if (!matchedAccount) {
    const googleAccounts = accountsResult.accounts.filter((account) => normalizePlatform(account.platformId) === 'google')
    if (googleAccounts.length === 1) matchedAccount = googleAccounts[0]
    else if (googleAccounts.length > 1) {
      return { success: false, locations: [], error: 'Multiple Google Business accounts are connected and the selected account could not be matched.' }
    }
  }

  if (!matchedAccount || normalizePlatform(matchedAccount.platformId) !== 'google') {
    return { success: false, locations: [], error: 'No matching Google Business account was found in PostFast.' }
  }

  const locationsResult = await postfastGetGBPLocations(apiKey, matchedAccount.id, timeoutMs)
  return {
    ...locationsResult,
    socialMediaId: matchedAccount.id,
  }
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
}): Promise<{ success: boolean; posts: PostFastPost[]; total?: number; hasNextPage?: boolean; error?: string }> {
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
      socialMediaId: asString(p.socialMediaId) || undefined,
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
  const pageInfo = asObject(dataObj.pageInfo)
  const hasNextPage = typeof pageInfo.hasNextPage === 'boolean' ? pageInfo.hasNextPage : undefined
  return { success: true, posts, total: totalCount, hasNextPage }
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
  }, timeoutMs)
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

export type PostFastStreamUploadResult = {
  success: boolean
  storageKey?: string
  error?: string
  code?: string
  retryable?: boolean
}

/**
 * Stream a public media URL directly into a PostFast signed upload URL.
 * This path is used by durable large-video jobs and intentionally never
 * materializes the full source in a Buffer/ArrayBuffer.
 */
export async function postfastUploadPublicUrlStream(input: {
  apiKey: string
  url: string
  filename?: string
  mimeType: string
  sizeBytes: number
  timeoutMs?: number
}): Promise<PostFastStreamUploadResult> {
  if (!/^https?:\/\//i.test(input.url)) {
    return {
      success: false,
      code: 'POSTFAST_SOURCE_URL_INVALID',
      error: 'Large-video background delivery requires a public HTTP(S) source URL.',
      retryable: false,
    }
  }

  const filename = input.filename || input.url.split('?')[0].split('/').pop() || 'video.mp4'
  const timeoutMs = Math.max(1, input.timeoutMs ?? 210_000)
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new Error('POSTFAST_TRANSFER_TIMEOUT')), timeoutMs)

  try {
    const signedResult = await postfastGetSignedUploadUrls(input.apiKey, [{
      filename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    }], Math.min(15_000, timeoutMs))
    if (!signedResult.success || signedResult.slots.length === 0) {
      return {
        success: false,
        code: 'POSTFAST_SIGNED_URL_FAILED',
        error: signedResult.error || 'Failed to get PostFast upload URL.',
        retryable: true,
      }
    }

    const source = await fetch(input.url, { signal: controller.signal })
    if (!source.ok || !source.body) {
      return {
        success: false,
        code: 'POSTFAST_SOURCE_UNAVAILABLE',
        error: `Source download HTTP ${source.status}`,
        retryable: source.status === 408 || source.status === 429 || source.status >= 500,
      }
    }

    const contentLength = source.headers.get('content-length') || (input.sizeBytes > 0 ? String(input.sizeBytes) : '')
    const headers: Record<string, string> = { 'Content-Type': input.mimeType }
    if (contentLength) headers['Content-Length'] = contentLength

    const slot = signedResult.slots[0]
    const requestInit = {
      method: 'PUT',
      headers,
      body: source.body,
      signal: controller.signal,
      duplex: 'half',
    } as RequestInit & { duplex: 'half' }
    const uploaded = await fetch(slot.uploadUrl, requestInit)
    if (!uploaded.ok) {
      const signedUrlExpired = uploaded.status === 401 || uploaded.status === 403
      return {
        success: false,
        code: signedUrlExpired ? 'POSTFAST_SIGNED_URL_EXPIRED' : 'POSTFAST_STREAM_UPLOAD_FAILED',
        error: `Upload HTTP ${uploaded.status}`,
        retryable: signedUrlExpired || uploaded.status === 408 || uploaded.status === 429 || uploaded.status >= 500,
      }
    }

    return { success: true, storageKey: slot.storageKey }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const timedOut = controller.signal.aborted || /timeout|aborted/i.test(message)
    return {
      success: false,
      code: timedOut ? 'POSTFAST_TRANSFER_TIMEOUT' : 'POSTFAST_TRANSFER_FAILED',
      error: timedOut ? 'Large-video transfer timed out.' : message,
      retryable: true,
    }
  } finally {
    clearTimeout(timeout)
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

function resolveInstagramPublishType(input: PostFastPublishInput, media: PreparedPostFastMedia[]): {
  publishType?: PostFastInstagramPublishType
  error?: string
} {
  const requested = input.instagramPublishType
  if (requested && !['TIMELINE', 'REEL', 'STORY'].includes(requested)) {
    return { error: 'Instagram 发布类型必须是 TIMELINE、REEL 或 STORY。' }
  }
  const isSingleVideo = media.length === 1 && media[0].metadata.kind === 'video'
  if (!requested) return { publishType: isSingleVideo ? 'REEL' : 'TIMELINE' }
  if (requested === 'REEL' && !isSingleVideo) {
    return { error: 'Instagram Reel 必须且只能包含一个视频素材。' }
  }
  if (requested === 'STORY' && media.length !== 1) {
    return { error: 'Instagram Story 必须且只能包含一个图片或视频素材。' }
  }
  if (requested === 'TIMELINE' && isSingleVideo) {
    return { error: 'Instagram 单视频请使用 REEL 或 STORY 发布类型。' }
  }
  return { publishType: requested }
}

function validIsoDate(value: string | undefined): boolean {
  return !!value && !Number.isNaN(new Date(value).getTime())
}

function buildPublishControls(input: PostFastPublishInput, platform: string, media: PreparedPostFastMedia[]): { controls?: Record<string, unknown>; error?: string; code?: string } {
  const optionalStrings = [
    input.firstComment, input.instagramLocationId, input.instagramLocationDisplayName,
    input.tiktokMusicSoundId, input.tiktokMusicSoundName, input.gbpCallToActionUrl,
    input.gbpEventTitle, input.gbpEventStartDate, input.gbpEventEndDate, input.gbpOfferCouponCode,
    input.gbpOfferRedeemUrl, input.gbpOfferTerms,
  ]
  if (optionalStrings.some((value) => value !== undefined && (typeof value !== 'string' || !value.trim()))) {
    return { code: 'POSTFAST_CONTROL_INVALID', error: 'PostFast text controls must be non-empty strings.' }
  }
  if ([input.instagramIsAiGenerated, input.instagramPostToGrid, input.tiktokAutoAddMusic].some((value) => value !== undefined && typeof value !== 'boolean')) {
    return { code: 'POSTFAST_CONTROL_INVALID', error: 'PostFast boolean controls must be true or false.' }
  }
  if (input.instagramTrialReelStrategy && input.instagramTrialReelStrategy !== 'SS_PERFORMANCE') {
    return { code: 'POSTFAST_CONTROL_INVALID', error: 'instagramTrialReelStrategy is invalid.' }
  }
  if (input.gbpTopicType && !['STANDARD', 'EVENT', 'OFFER'].includes(input.gbpTopicType)) {
    return { code: 'POSTFAST_CONTROL_INVALID', error: 'gbpTopicType is invalid.' }
  }
  if (input.gbpCallToActionType && !['BOOK', 'ORDER', 'SHOP', 'LEARN_MORE', 'SIGN_UP', 'CALL'].includes(input.gbpCallToActionType)) {
    return { code: 'POSTFAST_CONTROL_INVALID', error: 'gbpCallToActionType is invalid.' }
  }
  const controls: Record<string, unknown> = {}
  if (input.firstComment?.trim()) controls.firstComment = input.firstComment.trim()
  if (platform === 'instagram') {
    if (input.instagramLocationId) {
      if (media.length !== 1) return { code: 'INSTAGRAM_LOCATION_INVALID', error: 'Instagram location is only supported for a single-media post.' }
      controls.instagramLocationId = input.instagramLocationId
    }
    if (input.instagramIsAiGenerated === true) controls.instagramIsAiGenerated = true
    if (input.instagramPostToGrid !== undefined) controls.instagramPostToGrid = input.instagramPostToGrid
    if (input.instagramTrialReelStrategy) {
      if (input.instagramPublishType !== 'REEL') return { code: 'INSTAGRAM_TRIAL_REEL_INVALID', error: 'Instagram trial reel strategy requires instagramPublishType REEL.' }
      controls.instagramTrialReelStrategy = input.instagramTrialReelStrategy
    }
  }
  if (platform === 'tiktok') {
    if (input.tiktokMusicSoundId && input.tiktokAutoAddMusic) return { code: 'TIKTOK_MUSIC_CONFLICT', error: 'TikTok selected music and automatic music are mutually exclusive.' }
    if (input.tiktokMusicSoundId) {
      if (media.length < 2 || media.some((item) => item.metadata.kind !== 'image')) return { code: 'TIKTOK_MUSIC_INVALID', error: 'TikTok commercial music is only supported for image carousels.' }
      controls.tiktokMusicSoundId = input.tiktokMusicSoundId
    }
    if (input.tiktokAutoAddMusic === true) controls.tiktokAutoAddMusic = true
  }
  if (platform === 'google') {
    const topicType = input.gbpTopicType ?? 'STANDARD'
    if (topicType === 'EVENT') {
      if (!validIsoDate(input.gbpEventStartDate) || !validIsoDate(input.gbpEventEndDate) || new Date(input.gbpEventStartDate!).getTime() > new Date(input.gbpEventEndDate!).getTime()) return { code: 'GBP_EVENT_INVALID', error: 'GBP EVENT requires valid event start and end dates in chronological order.' }
    } else if (input.gbpEventStartDate || input.gbpEventEndDate) return { code: 'GBP_EVENT_INVALID', error: 'GBP event dates require gbpTopicType EVENT.' }
    if (topicType === 'OFFER') {
      if (!validIsoDate(input.gbpEventStartDate) || !validIsoDate(input.gbpEventEndDate) || new Date(input.gbpEventStartDate!).getTime() > new Date(input.gbpEventEndDate!).getTime()) return { code: 'GBP_OFFER_INVALID', error: 'GBP OFFER requires valid event start and end dates in chronological order.' }
    } else if (input.gbpOfferCouponCode || input.gbpOfferRedeemUrl || input.gbpOfferTerms) return { code: 'GBP_OFFER_INVALID', error: 'GBP offer fields require gbpTopicType OFFER.' }
    controls.gbpTopicType = topicType
    if (input.gbpCallToActionType) controls.gbpCallToActionType = input.gbpCallToActionType
    if (input.gbpCallToActionUrl) controls.gbpCallToActionUrl = input.gbpCallToActionUrl
    if (topicType === 'EVENT' || topicType === 'OFFER') Object.assign(controls, { gbpEventTitle: input.gbpEventTitle, gbpEventStartDate: input.gbpEventStartDate, gbpEventEndDate: input.gbpEventEndDate })
    if (topicType === 'OFFER') Object.assign(controls, { gbpOfferCouponCode: input.gbpOfferCouponCode, gbpOfferRedeemUrl: input.gbpOfferRedeemUrl, gbpOfferTerms: input.gbpOfferTerms })
  }
  return Object.keys(controls).length ? { controls } : {}
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
}): Promise<{ locationId?: string; error?: string; code?: string }> {
  const requested = String(input.requestedLocationId ?? '').trim()
  const handleLocationId = extractGoogleLocationId(input.accountHandle)
  const locationsResult = await postfastGetGBPLocations(
    input.apiKey,
    input.socialMediaId,
    remainingTimeout(input.deadlineAt, 5_000),
  )
  if (!locationsResult.success) {
    return {
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      error: `无法获取 PostFast Google Business locations: ${locationsResult.error || 'unknown error'}`,
    }
  }
  if (locationsResult.locations.length === 0) {
    return {
      code: 'GOOGLE_LOCATION_UNAVAILABLE',
      error: 'PostFast Google Business 账号没有同步到任何 location，请在 PostFast 重新连接或同步 GBP locations。',
    }
  }

  if (requested) {
    const wantedNorm = normalizeHandle(requested)
    const matched = locationsResult.locations.find((location) =>
      normalizeHandle(location.id) === wantedNorm ||
      normalizeHandle(location.placeId) === wantedNorm
    )
    if (matched) return { locationId: matched.id }
    return {
      code: 'GOOGLE_LOCATION_NOT_FOUND',
      error: '草稿选择的 Google Business 门店已不存在或不属于当前账号，请重新选择门店。',
    }
  }

  if (handleLocationId) {
    const wantedNorm = normalizeHandle(handleLocationId)
    const matched = locationsResult.locations.find((location) =>
      normalizeHandle(location.id) === wantedNorm ||
      normalizeHandle(location.placeId) === wantedNorm ||
      normalizeHandle(location.name).includes(wantedNorm)
    )
    if (matched) return { locationId: matched.id }
    return {
      code: 'GOOGLE_LOCATION_NOT_FOUND',
      error: 'Google Business 账号原有的门店绑定已失效，请重新选择门店。',
    }
  }

  return {
    code: 'GOOGLE_LOCATION_REQUIRED',
    error: '发布 Google Business 内容前必须明确选择一个门店。',
  }
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
      enforceUploadLimits: false,
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
      enforceUploadLimits: false,
    })
  }
  return inspectMediaUrl(item.url || '', {
    filename,
    mimeType: item.mimeType,
    deadlineAt,
    enforceUploadLimits: false,
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
  cover?: PreparedPostFastMedia
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

  let prepared = await mapWithConcurrency(unique, 3, async (item) => {
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
  const hasVideo = prepared.some((item) => item.metadata.kind === 'video')
  let preparedCover: PreparedPostFastMedia | undefined
  if (input.coverImage) {
    const coverStorageKey = postfastStorageKey(input.coverImage)
    const coverFilename = input.coverImage.filename || (coverStorageKey || input.coverImage.url || 'cover.jpg').split('/').pop() || 'cover.jpg'
    const coverMetadata = input.coverImage.metadata || await inspectPostfastMediaSource(
      input.coverImage,
      coverStorageKey,
      coverFilename,
      preflightDeadlineAt,
    )
    if (coverMetadata.kind !== 'image' || !['image/jpeg', 'image/png'].includes(coverMetadata.mimeType)) {
      throw { issues: [{
        assetId: input.coverImage.assetId,
        filename: coverFilename,
        platform: normalizePlatform(input.platform),
        field: 'coverImage',
        actual: coverMetadata.mimeType,
        limit: 'image/jpeg or image/png',
        message: '封面图必须为 JPEG 或 PNG 图片',
      }] }
    }
    const normalizedPlatform = normalizePlatform(input.platform)
    if (hasVideo && normalizedPlatform === 'instagram' && coverMetadata.sizeBytes > 8_000_000) {
      throw { issues: [{
        assetId: input.coverImage.assetId,
        filename: coverFilename,
        platform: normalizedPlatform,
        field: 'sizeBytes',
        actual: coverMetadata.sizeBytes,
        limit: 8_000_000,
        message: 'Instagram Reel 封面图不能超过 8 MB',
      }] }
    }
    preparedCover = {
      ...input.coverImage,
      storageKey: coverStorageKey || undefined,
      filename: coverFilename,
      mimeType: coverMetadata.mimeType,
      metadata: coverMetadata,
    }
  }

  if (preparedCover && !hasVideo) {
    const coverIdentity = postfastStorageKey(preparedCover) || preparedCover.url || ''
    prepared = [
      preparedCover,
      ...prepared.filter((item) => (postfastStorageKey(item) || item.url || '') !== coverIdentity),
    ]
    preparedCover = undefined
  }

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
  const normalizedPlatform = normalizePlatform(input.platform)
  if (
    preparedCover &&
    prepared.length === 1 &&
    prepared[0].metadata.kind === 'video' &&
    !['instagram', 'facebook', 'tiktok'].includes(normalizedPlatform)
  ) {
    warnings.push({
      assetId: preparedCover.assetId,
      filename: preparedCover.filename || 'cover',
      platform: normalizedPlatform,
      severity: 'warning',
      field: 'coverImage',
      actual: 'custom image',
      limit: `not supported by ${normalizedPlatform || 'this platform'}`,
      message: `${normalizedPlatform || '当前平台'} 不支持自定义图片封面，本次将发布视频本身并保留 AMC 封面记录`,
    })
  }
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
  return { items: prepared, cover: preparedCover, warnings }
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
  let preparedCoverImage: PreparedPostFastMedia | undefined
  let mediaWarnings: MediaValidationIssue[] = []
  try {
    const prepared = await preparePostfastMedia(input, publishDeadlineAt)
    preparedMediaItems = prepared.items
    preparedCoverImage = prepared.cover
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

  // Only callers without an explicit account may use a platform-level default.
  // A stale explicit provider ID must fail rather than publish through another account.
  if (!matchedAccount && !input.accountId) {
    const targetPlatformId = normalizePlatform(input.platform)
    matchedAccount = accounts.find(a => a.platformId.toLowerCase() === targetPlatformId.toLowerCase())
  }

  if (matchedAccount?.connectionStatus === 'DISABLED') {
    return { success: false, code: 'POSTFAST_ACCOUNT_DISABLED', error: matchedAccount.disabledReason || 'The selected PostFast account is disabled. Reconnect it before publishing.' }
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
  let resolvedCoverImageKey: string | undefined
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

  const normalizedPublishPlatform = normalizePlatform(input.platform)
  const canUseCustomVideoCover = preparedMediaItems.length === 1 &&
    preparedMediaItems[0].metadata.kind === 'video' &&
    ['instagram', 'facebook'].includes(normalizedPublishPlatform)
  if (preparedCoverImage && canUseCustomVideoCover) {
    try {
      const storageKey = postfastStorageKey(preparedCoverImage)
      if (storageKey) {
        resolvedCoverImageKey = storageKey
      } else if (preparedCoverImage.url) {
        const uploaded = await uploadPublicUrlToPostfast(
          input.apiKey,
          preparedCoverImage.url,
          preparedCoverImage.mimeType,
          preparedCoverImage.metadata,
          publishDeadlineAt,
        )
        resolvedCoverImageKey = uploaded.storageKey
      }
    } catch (e: unknown) {
      return { success: false, error: e instanceof Error ? `封面图上传失败: ${e.message}` : `封面图上传失败: ${String(e)}` }
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
  let resolvedInstagramPublishType: PostFastInstagramPublishType | undefined
  if (isInstagramPost) {
    const instagramPublishType = resolveInstagramPublishType(input, preparedMediaItems)
    if (!instagramPublishType.publishType) {
      return { success: false, code: 'INSTAGRAM_PUBLISH_TYPE_INVALID', error: instagramPublishType.error }
    }
    resolvedInstagramPublishType = instagramPublishType.publishType
    requestControls.instagramPublishType = resolvedInstagramPublishType
  }
  const platformControls = buildPublishControls(
    { ...input, instagramPublishType: resolvedInstagramPublishType ?? input.instagramPublishType },
    normalizedPublishPlatform,
    preparedMediaItems,
  )
  if (platformControls.error) return { success: false, code: platformControls.code, error: platformControls.error }
  Object.assign(requestControls, platformControls.controls)
  const isFacebookPost = normalizePlatform(input.platform) === 'facebook' ||
    normalizePlatform(matchedAccount.platformId) === 'facebook'
  if (isFacebookPost && resolvedCoverImageKey && resolvedMediaItems.length === 1) {
    requestControls.facebookContentType = 'REEL'
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
      return {
        success: false,
        code: resolvedLocation.code,
        error: resolvedLocation.error || '发布失败：Google Business 缺少 gbpLocationId。',
      }
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
    post.mediaItems = resolvedMediaItems.map((item, index) => {
      const type = detectMediaType(item.key, item.mimeType, item.type)
      return {
        key: item.key,
        type,
        sortOrder: index,
        ...(index === 0 && type === 'VIDEO' && normalizedPublishPlatform === 'tiktok'
          ? { coverTimestamp: '0' }
          : {}),
        ...(index === 0 && type === 'VIDEO' && resolvedCoverImageKey ? { coverImageKey: resolvedCoverImageKey } : {}),
      }
    })
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
    if (r.status === 0) {
      return {
        success: false,
        code: 'POSTFAST_RESULT_UNKNOWN',
        error: `PostFast post creation result is unknown: ${r.error || 'transport error'}`,
        warnings: mediaWarnings,
      }
    }
    if (Date.now() >= publishDeadlineAt - 250) return postfastPublishTimeout()
    return { success: false, error: r.error }
  }

  // Official response is { postIds: string[] }. Keep the legacy shapes for
  // compatibility with older PostFast deployments.
  const dataObj = asObject(r.data)
  const created = Array.isArray(r.data)
    ? r.data[0]
    : (Array.isArray(dataObj.posts) ? dataObj.posts[0] : r.data)
  const createdObj = asObject(created)
  const postIds = Array.isArray(dataObj.postIds) ? dataObj.postIds : []
  const postId = asString(createdObj.post_id)
    || asString(createdObj.id)
    || asString(postIds[0])

  if (!postId) {
    return {
      success: false,
      code: 'POSTFAST_RESULT_UNKNOWN',
      error: 'PostFast accepted the publish request but did not return a post ID.',
      warnings: mediaWarnings,
    }
  }

  return {
    success: true,
    postId,
    url: asString(createdObj.url) || asString(createdObj.postUrl) || undefined,
    scheduledAt: asString(createdObj.scheduledAt) || normalizedSchedule.value,
    warnings: mediaWarnings,
  }
}

// ── Review Replies ─────────────────────────────────────────────────────────

function inboxCollection(data: unknown, key: 'conversations' | 'items'): JsonRecord[] {
  if (Array.isArray(data)) return data.filter((entry): entry is JsonRecord => Boolean(entry && typeof entry === 'object'))
  const root = asObject(data)
  const collection = Array.isArray(root[key]) ? root[key] : Array.isArray(root.data) ? root.data : []
  return collection.filter((entry): entry is JsonRecord => Boolean(entry && typeof entry === 'object'))
}

function inboxPagination(data: unknown) {
  const root = asObject(data)
  const pageInfo = asObject(root.pageInfo)
  return {
    total: asNumber(root.totalCount) ?? asNumber(root.total),
    hasNextPage: typeof pageInfo.hasNextPage === 'boolean'
      ? pageInfo.hasNextPage
      : typeof root.hasNextPage === 'boolean'
        ? root.hasNextPage
        : undefined,
  }
}

function postfastInboxConversation(value: JsonRecord): PostFastInboxConversation {
  return {
    id: asString(value.id) || asString(value.conversationId),
    socialMediaId: asString(value.socialMediaId) || asString(value.accountId) || undefined,
    platform: normalizePlatform(value.platform),
    status: asString(value.status) || undefined,
    subject: asString(value.subject) || asString(value.title) || undefined,
    participantName: asString(value.participantName) || asString(value.senderName) || undefined,
    unreadCount: asNumber(value.unreadCount) ?? (value.unread === true ? 1 : 0),
    needsAttention: value.needsAttention === true || value.requiresAttention === true,
    lastMessageAt: asString(value.lastMessageAt) || asString(value.updatedAt) || undefined,
    raw: value,
  }
}

function postfastInboxItem(value: JsonRecord): PostFastInboxItem {
  return {
    id: asString(value.id) || asString(value.itemId) || asString(value.commentId),
    conversationId: asString(value.conversationId) || undefined,
    authorName: asString(value.authorName) || asString(value.senderName) || undefined,
    body: asString(value.body) || asString(value.text) || asString(value.message) || undefined,
    direction: asString(value.direction) || undefined,
    state: asString(value.state) || asString(value.moderationState) || undefined,
    unread: value.unread === true || value.isUnread === true,
    canReply: value.canReply === true,
    canPrivateReply: value.canPrivateReply === true,
    maxReplyLength: asNumber(value.maxReplyLength),
    maxPrivateReplyLengthBytes: asNumber(value.maxPrivateReplyLengthBytes),
    replyWindowEndsAt: asString(value.replyWindowEndsAt) || asString(value.replyWindowEnd) || undefined,
    raw: value,
  }
}

export async function postfastListInboxConversations(apiKey: string, options: { limit?: number; page?: number } = {}): Promise<{
  success: boolean
  conversations: PostFastInboxConversation[]
  total?: number
  hasNextPage?: boolean
  error?: string
}> {
  const query = new URLSearchParams()
  if (options.limit) query.set('limit', String(options.limit))
  if (options.page !== undefined) query.set('page', String(options.page))
  const r = await pfFetch(apiKey, `/social-inbox/conversations${query.size ? `?${query}` : ''}`)
  if (!r.ok) return { success: false, conversations: [] as PostFastInboxConversation[], error: r.error }
  return { success: true, conversations: inboxCollection(r.data, 'conversations').map(postfastInboxConversation), ...inboxPagination(r.data) }
}

export async function postfastListInboxItems(apiKey: string, conversationId: string, options: { limit?: number; page?: number } = {}): Promise<{
  success: boolean
  items: PostFastInboxItem[]
  total?: number
  hasNextPage?: boolean
  error?: string
}> {
  const query = new URLSearchParams()
  if (options.limit) query.set('limit', String(options.limit))
  if (options.page !== undefined) query.set('page', String(options.page))
  const r = await pfFetch(apiKey, `/social-inbox/conversations/${encodeURIComponent(conversationId)}/items${query.size ? `?${query}` : ''}`)
  if (!r.ok) return { success: false, items: [] as PostFastInboxItem[], error: r.error }
  return { success: true, items: inboxCollection(r.data, 'items').map(postfastInboxItem), ...inboxPagination(r.data) }
}

export async function postfastReplyInboxItem(input: { apiKey: string; itemId: string; text: string; idempotencyKey: string }) {
  const r = await pfFetch(input.apiKey, `/social-inbox/items/${encodeURIComponent(input.itemId)}/reply`, {
    method: 'POST', headers: { 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ text: input.text, idempotencyKey: input.idempotencyKey }),
  })
  return r.ok ? { success: true, status: r.status } : { success: false, status: r.status, error: r.error }
}

export async function postfastPrivateReplyInboxItem(input: { apiKey: string; itemId: string; text: string; idempotencyKey: string }) {
  const r = await pfFetch(input.apiKey, `/social-inbox/items/${encodeURIComponent(input.itemId)}/private-reply`, {
    method: 'POST', headers: { 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ text: input.text, idempotencyKey: input.idempotencyKey }),
  })
  return r.ok ? { success: true, status: r.status } : { success: false, status: r.status, error: r.error }
}

export async function postfastSetInboxItemState(input: { apiKey: string; itemId: string; state: 'HIDE' | 'UNHIDE' | 'DELETE'; idempotencyKey: string }) {
  if (!['HIDE', 'UNHIDE', 'DELETE'].includes(input.state)) {
    return { success: false, status: 400, error: 'PostFast inbox state must be HIDE, UNHIDE, or DELETE.' }
  }
  const r = await pfFetch(input.apiKey, `/social-inbox/items/${encodeURIComponent(input.itemId)}/state`, {
    method: 'POST', headers: { 'Idempotency-Key': input.idempotencyKey }, body: JSON.stringify({ action: input.state, idempotencyKey: input.idempotencyKey }),
  })
  return r.ok ? { success: true, status: r.status } : { success: false, status: r.status, error: r.error }
}

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
