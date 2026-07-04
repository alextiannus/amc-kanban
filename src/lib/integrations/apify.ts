/**
 * Apify Integration
 * Runs cloud scraping actors to collect social media and review data for brands.
 *
 * Actors used:
 *  - compass/google-maps-reviews-scraper   → Google Maps reviews
 *  - apify/instagram-scraper               → Instagram posts + profile stats
 *  - clockworks/free-tiktok-scraper        → TikTok posts + profile stats
 *  - junglee/free-xiaohongshu-scraper      → Xiaohongshu / RED posts
 */

const APIFY_BASE = 'https://api.apify.com/v2'

interface ApifyRunResponse {
  data?: {
    id: string
    defaultDatasetId: string
    status: string
    stats?: { itemCount?: number }
    finishedAt?: string | null
  }
}

interface GoogleReviewItem {
  reviewer?: { displayName?: string }
  name?: string
  stars?: number
  rating?: number
  text?: string
  snippet?: string
  publishedAtDate?: string
  time?: string
  responseFromOwnerText?: string
  reviewUrl?: string
}

interface InstagramItem {
  ownerUsername?: string
  username?: string
  ownerFullName?: string
  followersCount?: number
  ownerFollowersCount?: number
  followingCount?: number
  postsCount?: number
  biography?: string
  profilePicUrl?: string
  verified?: boolean
  type?: string
  timestamp?: string
  taken_at_timestamp?: number
  id?: string
  shortCode?: string
  caption?: string
  alt?: string
  url?: string
  likesCount?: number
  likes_count?: number
  commentsCount?: number
  comments_count?: number
  videoViewCount?: number
  playCount?: number
  displayUrl?: string
  thumbnailUrl?: string
}

interface TikTokItem {
  authorMeta?: {
    name?: string
    nickName?: string
    fans?: number
    following?: number
    video?: number
    signature?: string
    avatar?: string
    verified?: boolean
  }
  author?: {
    uniqueId?: string
    nickname?: string
    fans?: number
  }
  createTimeISO?: string
  createTime?: number
  id?: string
  text?: string
  desc?: string
  webVideoUrl?: string
  diggCount?: number
  stats?: {
    diggCount?: number
    commentCount?: number
    shareCount?: number
    playCount?: number
  }
  commentCount?: number
  shareCount?: number
  playCount?: number
  covers?: string[]
  thumbnail?: string
}

interface XiaohongshuItem {
  authorName?: string
  noteId?: string
  id?: string
  title?: string
  desc?: string
  noteUrl?: string
  url?: string
  publishTime?: string
  likeCount?: number
  likes?: number
  commentCount?: number
  comments?: number
  shareCount?: number
  shares?: number
  viewCount?: number
  imageList?: string[]
  coverUrl?: string
}

function getToken(): string {
  const t = process.env.APIFY_API_TOKEN
  if (!t) throw new Error('APIFY_API_TOKEN is not set')
  return t
}

// ─────────────────────────────────────────────────────────────────────────────
// Core API helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Start an actor run and return the run ID + default dataset ID */
export async function startActorRun(
  actorId: string,
  input: Record<string, unknown>,
  options: { timeoutSecs?: number; memoryMbytes?: number } = {}
): Promise<{ runId: string; datasetId: string; status: string }> {
  const token = getToken()
  const params = new URLSearchParams({ token })
  if (options.timeoutSecs) params.set('timeout', String(options.timeoutSecs))
  if (options.memoryMbytes) params.set('memory', String(options.memoryMbytes))

  const res = await fetch(`${APIFY_BASE}/acts/${actorId}/runs?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Apify startRun failed (${res.status}): ${body.slice(0, 300)}`)
  }

  const json = (await res.json()) as ApifyRunResponse
  const run = json.data
  if (!run?.id || !run.defaultDatasetId || !run.status) {
    throw new Error('Apify startRun returned invalid payload')
  }
  return { runId: run.id, datasetId: run.defaultDatasetId, status: run.status }
}

/** Get the current status of an actor run */
export async function getRunStatus(runId: string): Promise<{
  status: 'READY' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'TIMING-OUT' | 'TIMED-OUT' | 'ABORTING' | 'ABORTED'
  datasetId: string
  itemCount: number
  finishedAt: string | null
}> {
  const token = getToken()
  const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`)
  if (!res.ok) throw new Error(`Apify getRunStatus failed (${res.status})`)
  const json = await res.json()
  const run = json.data
  if (!run?.defaultDatasetId || !run.status) {
    throw new Error('Apify getRunStatus returned invalid payload')
  }
  return {
    status: run.status,
    datasetId: run.defaultDatasetId,
    itemCount: run.stats?.itemCount ?? 0,
    finishedAt: run.finishedAt ?? null,
  }
}

/** Fetch items from an Apify dataset */
export async function getDatasetItems<T = unknown>(
  datasetId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<T[]> {
  const token = getToken()
  const params = new URLSearchParams({ token, clean: 'true', format: 'json' })
  if (options.limit) params.set('limit', String(options.limit))
  if (options.offset) params.set('offset', String(options.offset))

  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?${params}`)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Apify getDatasetItems failed (${res.status}): ${body.slice(0, 300)}`)
  }
  return res.json()
}

/**
 * Start a run and poll until finished or timeout.
 * Returns dataset items on success.
 */
export async function runActorAndWait<T = unknown>(
  actorId: string,
  input: Record<string, unknown>,
  options: {
    timeoutSecs?: number
    memoryMbytes?: number
    pollIntervalMs?: number
    maxItems?: number
  } = {}
): Promise<{ items: T[]; runId: string; durationMs: number; error?: string }> {
  const t0 = Date.now()
  const pollInterval = options.pollIntervalMs ?? 4000
  const maxWaitMs = (options.timeoutSecs ?? 90) * 1000

  let runId: string
  let datasetId: string

  try {
    const run = await startActorRun(actorId, input, {
      timeoutSecs: options.timeoutSecs ?? 90,
      memoryMbytes: options.memoryMbytes ?? 256,
    })
    runId = run.runId
    datasetId = run.datasetId
  } catch (e: unknown) {
    return { items: [], runId: '', durationMs: Date.now() - t0, error: e instanceof Error ? e.message : 'Apify start failed' }
  }

  // Poll for completion
  while (Date.now() - t0 < maxWaitMs) {
    await new Promise(r => setTimeout(r, pollInterval))
    try {
      const status = await getRunStatus(runId)
      if (status.status === 'SUCCEEDED') {
        const items = await getDatasetItems<T>(datasetId, { limit: options.maxItems ?? 100 })
        return { items, runId, durationMs: Date.now() - t0 }
      }
      if (['FAILED', 'TIMED-OUT', 'ABORTED'].includes(status.status)) {
        return { items: [], runId, durationMs: Date.now() - t0, error: `Run ${status.status}` }
      }
    } catch {
      // transient poll error — keep trying
    }
  }

  return { items: [], runId, durationMs: Date.now() - t0, error: 'Client-side timeout waiting for Apify run' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Normalised data types
// ─────────────────────────────────────────────────────────────────────────────

export interface ApifyReview {
  source: 'google_maps' | 'yelp'
  reviewerName: string
  rating: number        // 1–5
  text: string
  publishedAt: string   // ISO
  replyText?: string
  url?: string
}

export interface ApifyPost {
  source: 'instagram' | 'tiktok' | 'xiaohongshu'
  platform: string
  handle: string
  postId: string
  caption: string
  url: string
  publishedAt: string
  likes: number
  comments: number
  shares: number
  views: number
  imageUrl?: string
}

export interface ApifyProfile {
  platform: string
  handle: string
  displayName?: string
  followerCount: number
  followingCount?: number
  postCount?: number
  bio?: string
  profilePicUrl?: string
  verifiedAccount?: boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Google Maps Reviews  (compass/google-maps-reviews-scraper)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeGoogleMapsReviews(input: {
  placeId?: string
  searchQuery?: string
  maxReviews?: number
  language?: string
}): Promise<{ reviews: ApifyReview[]; runId: string; durationMs: number; error?: string }> {
  if (!input.placeId && !input.searchQuery) {
    return { reviews: [], runId: '', durationMs: 0, error: 'Requires placeId or searchQuery' }
  }

  const actorInput: Record<string, unknown> = {
    maxReviews: input.maxReviews ?? 50,
    reviewsSort: 'newest',
    language: input.language ?? 'en',
    personalData: true,
    reviewsOrigin: 'all',
  }

  if (input.placeId) {
    // compass actor accepts placeIds as a direct array — confirmed via live test
    actorInput.placeIds = [input.placeId]
  } else if (input.searchQuery) {
    // Keyword fallback: actor will search Google Maps for this string
    actorInput.searchStringsArray = [input.searchQuery]
  }

  const result = await runActorAndWait<GoogleReviewItem>(
    'compass~google-maps-reviews-scraper',
    actorInput,
    { timeoutSecs: 120, memoryMbytes: 512, maxItems: input.maxReviews ?? 50 }
  )

  const reviews: ApifyReview[] = (result.items ?? []).map((r) => ({
    source: 'google_maps' as const,
    reviewerName: r.reviewer?.displayName ?? r.name ?? '匿名顾客',
    rating: typeof r.stars === 'number' ? r.stars : (typeof r.rating === 'number' ? r.rating : 3),
    text: r.text ?? r.snippet ?? '',
    publishedAt: r.publishedAtDate ?? r.time ?? new Date().toISOString(),
    replyText: r.responseFromOwnerText ?? undefined,
    url: r.reviewUrl ?? undefined,
  })).filter((r: ApifyReview) => r.text.length > 0)

  return { reviews, runId: result.runId, durationMs: result.durationMs, error: result.error }
}

// ─────────────────────────────────────────────────────────────────────────────
// Instagram  (apify/instagram-scraper)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeInstagram(input: {
  handles: string[]
  maxPosts?: number
}): Promise<{
  posts: ApifyPost[]
  profiles: ApifyProfile[]
  runId: string
  durationMs: number
  error?: string
}> {
  if (input.handles.length === 0) {
    return { posts: [], profiles: [], runId: '', durationMs: 0, error: 'No handles provided' }
  }

  const result = await runActorAndWait<InstagramItem>(
    'apify~instagram-scraper',
    {
      directUrls: input.handles.map(h => `https://www.instagram.com/${h}/`),
      resultsType: 'posts',
      resultsLimit: input.maxPosts ?? 30,
      addParentData: true,
    },
    { timeoutSecs: 120, memoryMbytes: 512, maxItems: (input.maxPosts ?? 30) * input.handles.length }
  )

  const posts: ApifyPost[] = []
  const profileMap = new Map<string, ApifyProfile>()

  for (const item of result.items ?? []) {
    const handle = item.ownerUsername ?? item.username ?? ''

    // Build profile from post owner data
    if (handle && !profileMap.has(handle)) {
      profileMap.set(handle, {
        platform: 'instagram',
        handle,
        displayName: item.ownerFullName ?? handle,
        followerCount: item.followersCount ?? item.ownerFollowersCount ?? 0,
        followingCount: item.followingCount ?? undefined,
        postCount: item.postsCount ?? undefined,
        bio: item.biography ?? undefined,
        profilePicUrl: item.profilePicUrl ?? undefined,
        verifiedAccount: item.verified ?? false,
      })
    }

    if (item.type !== 'profile') {
      // Fix: item.timestamp is already an ISO string (e.g. '2026-05-15T03:11:16.000Z').
      // The previous code had an operator-precedence bug: the ternary bound to
      // (item.timestamp ?? item.taken_at_timestamp) which is always truthy when
      // timestamp exists, so taken_at_timestamp (undefined → 0) was always used → epoch 1970.
      const publishedAt = item.timestamp
        ? item.timestamp                                                       // ISO string — use directly
        : item.taken_at_timestamp
          ? new Date(item.taken_at_timestamp * 1000).toISOString()            // unix seconds → ISO
          : new Date().toISOString()                                            // fallback: now

      posts.push({
        source: 'instagram',
        platform: 'instagram',
        handle,
        postId: item.id ?? item.shortCode ?? '',
        caption: item.caption ?? item.alt ?? '',
        url: item.url ?? `https://www.instagram.com/p/${item.shortCode}/`,
        publishedAt,
        likes: item.likesCount ?? item.likes_count ?? 0,
        comments: item.commentsCount ?? item.comments_count ?? 0,
        shares: 0,
        views: item.videoViewCount ?? item.playCount ?? 0,
        imageUrl: item.displayUrl ?? item.thumbnailUrl ?? undefined,
      })
    }
  }

  return {
    posts,
    profiles: Array.from(profileMap.values()),
    runId: result.runId,
    durationMs: result.durationMs,
    error: result.error,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TikTok  (clockworks/free-tiktok-scraper)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeTikTok(input: {
  handles: string[]
  maxPosts?: number
}): Promise<{
  posts: ApifyPost[]
  profiles: ApifyProfile[]
  runId: string
  durationMs: number
  error?: string
}> {
  if (input.handles.length === 0) {
    return { posts: [], profiles: [], runId: '', durationMs: 0, error: 'No handles provided' }
  }

  const result = await runActorAndWait<TikTokItem>(
    'clockworks~free-tiktok-scraper',
    {
      // clockworks actor expects profiles as a newline-separated STRING, not a JSON array.
      // Confirmed from live dataset: item.input = "chengduziweigrilledfishh" (plain string).
      profiles: input.handles.join('\n'),
      resultsPerPage: input.maxPosts ?? 30,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    { timeoutSecs: 120, memoryMbytes: 512, maxItems: (input.maxPosts ?? 30) * input.handles.length }
  )

  const posts: ApifyPost[] = []
  const profileMap = new Map<string, ApifyProfile>()

  for (const item of result.items ?? []) {
    const handle = item.authorMeta?.name ?? item.author?.uniqueId ?? ''

    if (handle && !profileMap.has(handle)) {
      profileMap.set(handle, {
        platform: 'tiktok',
        handle,
        displayName: item.authorMeta?.nickName ?? item.author?.nickname ?? handle,
        followerCount: item.authorMeta?.fans ?? item.author?.fans ?? 0,
        followingCount: item.authorMeta?.following ?? undefined,
        postCount: item.authorMeta?.video ?? undefined,
        bio: item.authorMeta?.signature ?? undefined,
        profilePicUrl: item.authorMeta?.avatar ?? undefined,
        verifiedAccount: item.authorMeta?.verified ?? false,
      })
    }

    if (item.id) {
      // createTimeISO is an explicit ISO string from the actor; createTime is unix seconds
      const publishedAt = item.createTimeISO
        ?? (item.createTime ? new Date(item.createTime * 1000).toISOString() : new Date().toISOString())

      posts.push({
        source: 'tiktok',
        platform: 'tiktok',
        handle,
        postId: item.id,
        caption: item.text ?? item.desc ?? '',
        url: item.webVideoUrl ?? `https://www.tiktok.com/@${handle}/video/${item.id}`,
        publishedAt,
        likes: item.diggCount ?? item.stats?.diggCount ?? 0,
        comments: item.commentCount ?? item.stats?.commentCount ?? 0,
        shares: item.shareCount ?? item.stats?.shareCount ?? 0,
        views: item.playCount ?? item.stats?.playCount ?? 0,
        imageUrl: item.covers?.[0] ?? item.thumbnail ?? undefined,
      })
    }
  }

  return {
    posts,
    profiles: Array.from(profileMap.values()),
    runId: result.runId,
    durationMs: result.durationMs,
    error: result.error,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Xiaohongshu / RED  (junglee/xiaohongshu-scraper)
// ─────────────────────────────────────────────────────────────────────────────

export async function scrapeXiaohongshu(input: {
  keywords?: string[]
  handles?: string[]
  maxPosts?: number
}): Promise<{
  posts: ApifyPost[]
  profiles: ApifyProfile[]
  runId: string
  durationMs: number
  error?: string
}> {
  if ((!input.keywords || input.keywords.length === 0) && (!input.handles || input.handles.length === 0)) {
    return { posts: [], profiles: [], runId: '', durationMs: 0, error: 'Requires keywords or handles' }
  }

  const actorInput: Record<string, unknown> = {
    maxItems: input.maxPosts ?? 20,
  }

  if (input.keywords && input.keywords.length > 0) {
    actorInput.searchKeywords = input.keywords
  }
  if (input.handles && input.handles.length > 0) {
    actorInput.profiles = input.handles
  }

  const result = await runActorAndWait<XiaohongshuItem>(
    // easyapi/all-in-one-rednote-xiaohongshu-scraper is a well-maintained
    // aggregator that handles both profile-based and keyword-based searches
    'easyapi~all-in-one-rednote-xiaohongshu-scraper',
    actorInput,
    { timeoutSecs: 120, memoryMbytes: 256, maxItems: input.maxPosts ?? 20 }
  )

  const posts: ApifyPost[] = (result.items ?? []).map((item) => ({
    source: 'xiaohongshu' as const,
    platform: 'xiaohongshu',
    handle: item.authorName ?? '',
    postId: item.noteId ?? item.id ?? '',
    caption: item.title ? `${item.title}\n${item.desc ?? ''}` : (item.desc ?? ''),
    url: item.noteUrl ?? item.url ?? '',
    publishedAt: item.publishTime
      ? new Date(item.publishTime).toISOString()
      : new Date().toISOString(),
    likes: item.likeCount ?? item.likes ?? 0,
    comments: item.commentCount ?? item.comments ?? 0,
    shares: item.shareCount ?? item.shares ?? 0,
    views: item.viewCount ?? 0,
    imageUrl: item.imageList?.[0] ?? item.coverUrl ?? undefined,
  }))

  return { posts, profiles: [], runId: result.runId, durationMs: result.durationMs, error: result.error }
}

// ─────────────────────────────────────────────────────────────────────────────
// Facebook  (apify/facebook-pages-scraper)
// ─────────────────────────────────────────────────────────────────────────────

interface FacebookItem {
  pageId?: string
  pageName?: string
  title?: string
  url?: string
  likes?: number
  followers?: number
  postId?: string
  id?: string
  type?: string
  message?: string
  link?: string
  postUrl?: string
  time?: string
  timestamp?: string
  date?: string
  likesCount?: number
  commentsCount?: number
  sharesCount?: number
  viewsCount?: number
  videoViewCount?: number
  media?: Array<{ thumbnail?: string; url?: string }>
  topImage?: string
}

export async function scrapeFacebook(input: {
  pageUrls: string[]
  maxPosts?: number
}): Promise<{
  posts: ApifyPost[]
  profiles: ApifyProfile[]
  runId: string
  durationMs: number
  error?: string
}> {
  if (input.pageUrls.length === 0) {
    return { posts: [], profiles: [], runId: '', durationMs: 0, error: 'No page URLs provided' }
  }

  const result = await runActorAndWait<FacebookItem>(
    'apify~facebook-pages-scraper',
    {
      startUrls: input.pageUrls.map(url => ({ url })),
      maxPosts: input.maxPosts ?? 30,
      maxPostComments: 0,
      maxReviews: 0,
      scrapeAbout: false,
      scrapeReviews: false,
      scrapeServices: false,
    },
    { timeoutSecs: 180, memoryMbytes: 1024, maxItems: (input.maxPosts ?? 30) * input.pageUrls.length + input.pageUrls.length }
  )

  const posts: ApifyPost[] = []
  const profileMap = new Map<string, ApifyProfile>()

  for (const item of result.items ?? []) {
    // Profile item (page-level, no postId)
    if (item.pageName && !item.postId && !item.id) {
      const handle = item.url ?? item.pageId ?? item.pageName ?? ''
      if (handle && !profileMap.has(handle)) {
        profileMap.set(handle, {
          platform: 'facebook',
          handle,
          displayName: item.pageName ?? item.title ?? handle,
          followerCount: item.followers ?? item.likes ?? 0,
        })
      }
      continue
    }

    // Post item
    const postId = item.postId ?? item.id ?? ''
    if (!postId) continue

    const rawTime = item.time ?? item.timestamp ?? item.date ?? ''
    const normalizedAt = rawTime
      ? (/^\d{10,13}$/.test(rawTime)
          ? new Date(Number(rawTime) * (rawTime.length === 10 ? 1000 : 1)).toISOString()
          : rawTime)
      : new Date().toISOString()

    const pageHandle = item.url ?? item.link?.split('/posts/')[0] ?? ''

    posts.push({
      source: 'instagram' as const,   // ApifyPost.source union — platform field carries 'facebook'
      platform: 'facebook',
      handle: pageHandle,
      postId,
      caption: item.message ?? '',
      url: item.postUrl ?? item.link ?? `https://www.facebook.com/${postId}`,
      publishedAt: normalizedAt,
      likes: item.likesCount ?? item.likes ?? 0,
      comments: item.commentsCount ?? 0,
      shares: item.sharesCount ?? 0,
      views: item.videoViewCount ?? item.viewsCount ?? 0,
      imageUrl: item.topImage ?? item.media?.[0]?.thumbnail ?? item.media?.[0]?.url ?? undefined,
    })
  }

  return {
    posts,
    profiles: Array.from(profileMap.values()),
    runId: result.runId,
    durationMs: result.durationMs,
    error: result.error,
  }
}
