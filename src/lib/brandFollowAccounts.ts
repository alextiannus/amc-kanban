import { createHash } from 'node:crypto'
import { publicHttpUrl } from './brandFollowLinks'
import { accountPlatform, providerForLocal, type AccountIdentity } from './socialAccountIdentity'
import { postfastFetchAccounts, postfastListPosts, postfastGetGBPLocations, type PostFastAccount, type PostFastPost } from './integrations/postfast'

export type StoredFollowAccount = AccountIdentity & { unboundAt?: Date | string | null }
const cache = new Map<string, { expiresAt: number; value: unknown }>()
const pending = new Map<string, Promise<unknown>>()

function googleLocationKey(value: string): string {
  return value.trim().replace(/^(?:accounts\/[^/]+\/)?locations\//, '')
}

function reportGoogleSync(brandId: string | undefined, reason: string, details: Record<string, number | boolean> = {}) {
  console.info(JSON.stringify({ event: 'brand_follow_google_sync', brandId, reason, ...details }))
}

async function cached<T>(key: string, load: () => Promise<{ success: boolean } & T>): Promise<({ success: boolean } & T) | null> {
  const found = cache.get(key)
  if (found && found.expiresAt > Date.now()) return found.value as { success: boolean } & T
  const running = pending.get(key)
  if (running) return running as Promise<({ success: boolean } & T) | null>
  const promise = (async () => {
    let value: ({ success: boolean } & T) | null = null
    try { value = await load() } catch { /* Keep recorded links when the provider is unavailable. */ }
    if (cache.size >= 128) cache.delete(cache.keys().next().value!)
    cache.set(key, { value, expiresAt: Date.now() + (value?.success ? 300_000 : 15_000) })
    return value
  })()
  pending.set(key, promise)
  try { return await promise } finally { pending.delete(key) }
}

/** A post is evidence only for its exact provider account; never match by platform alone. */
export function profileFromAccountPost(account: Pick<PostFastAccount, 'id' | 'platformId'>, post: Pick<PostFastPost, 'socialMediaId' | 'platformId' | 'postUrl' | 'status'>): string | null {
  if (post.socialMediaId !== account.id || post.status !== 'published' || accountPlatform(post.platformId) !== accountPlatform(account.platformId)) return null
  const safe = publicHttpUrl(post.postUrl)
  if (!safe) return null
  const url = new URL(safe)
  if (accountPlatform(account.platformId) === 'facebook' && ['facebook.com', 'www.facebook.com', 'm.facebook.com'].includes(url.hostname.toLowerCase())) {
    const parts = url.pathname.split('/').filter(Boolean)
    const owner = parts[0]
    if (parts[1] === 'posts' && owner && /^[a-zA-Z0-9.]+$/.test(owner) && !['groups', 'watch', 'reel', 'reels', 'share', 'pages', 'events', 'login', 'help', 'profile.php', 'permalink.php', 'story.php'].includes(owner.toLowerCase())) return `https://www.facebook.com/${owner}`
    const pageId = url.searchParams.get('id')
    if (['permalink.php', 'story.php', 'profile.php'].includes(owner) && pageId && /^\d+$/.test(pageId)) return `https://www.facebook.com/${pageId}`
  }
  if (accountPlatform(account.platformId) === 'tiktok' && ['tiktok.com', 'www.tiktok.com'].includes(url.hostname.toLowerCase())) {
    const match = /^\/@([a-zA-Z0-9_.]+)\/video\/\d+/.exec(url.pathname)
    if (match) return `https://www.tiktok.com/@${match[1]}`
  }
  return null
}

export async function resolveBrandFollowAccounts(accounts: StoredFollowAccount[], apiKey?: string | null, googleLocationId?: string | null, brandId?: string) {
  const bound = accounts.filter(account => !account.unboundAt)
  const result = bound.map(account => ({ platformId: account.platformId, handle: account.handle, profileUrl: publicHttpUrl(account.profileUrl) }))
  const missing = bound.filter((account, index) => !result[index].profileUrl && (account.postfastAccountId || (account.handle && account.handle !== 'unconfigured')))
  const missingGoogle = missing.some(account => accountPlatform(account.platformId) === 'google')
  if (!apiKey || !missing.length) {
    if (missingGoogle) reportGoogleSync(brandId, 'PROVIDER_NOT_CONFIGURED')
    return result
  }
  const credentialKey = createHash('sha256').update(apiKey).digest('hex')
  // New bindings change this key on every instance, so old snapshots cannot hide a new account.
  const bindingKey = createHash('sha256').update(JSON.stringify(bound.map(account => [account.id, account.postfastAccountId, account.platformId, account.handle]).sort())).digest('hex')
  const cacheKey = `${credentialKey}:${bindingKey}`
  const snapshot = await cached(`${cacheKey}:accounts`, () => postfastFetchAccounts(apiKey, 3_000))
  if (!snapshot?.success) {
    if (missingGoogle) reportGoogleSync(brandId, 'ACCOUNTS_UNAVAILABLE')
    return result
  }
  const availableIds = new Set(snapshot.accounts.map(account => account.id))
  if (missing.some(account => account.postfastAccountId && !availableIds.has(account.postfastAccountId))) {
    const entry = cache.get(`${cacheKey}:accounts`)
    if (entry) entry.expiresAt = Math.min(entry.expiresAt, Date.now() + 15_000)
  }
  const unresolved: { index: number; remote: PostFastAccount }[] = []
  for (let index = 0; index < bound.length; index++) {
    if (result[index].profileUrl || (!bound[index].postfastAccountId && bound[index].handle === 'unconfigured')) continue
    let remote: PostFastAccount | undefined
    try { remote = providerForLocal(bound[index], snapshot.accounts) } catch {
      if (accountPlatform(bound[index].platformId) === 'google') reportGoogleSync(brandId, 'ACCOUNT_AMBIGUOUS')
      continue
    }
    if (!remote || accountPlatform(remote.platformId) !== accountPlatform(bound[index].platformId)) {
      if (accountPlatform(bound[index].platformId) === 'google') reportGoogleSync(brandId, 'BOUND_ACCOUNT_NOT_FOUND')
      continue
    }
    const profileUrl = publicHttpUrl(remote.profileUrl)
    if (profileUrl) result[index] = { platformId: bound[index].platformId, handle: remote.handle, profileUrl }
    else if (accountPlatform(remote.platformId) === 'google') {
      const response = await cached(`${cacheKey}:google:${remote.id}`, () => postfastGetGBPLocations(apiKey, remote.id, 3_000))
      if (!response?.success) { reportGoogleSync(brandId, 'LOCATIONS_UNAVAILABLE'); continue }
      if (!response.locations.length) {
        // A newly synchronized location should become visible on the next preview refresh.
        const entry = cache.get(`${cacheKey}:google:${remote.id}`)
        if (entry) entry.expiresAt = Math.min(entry.expiresAt, Date.now() + 15_000)
        reportGoogleSync(brandId, 'NO_SYNCED_LOCATIONS', { locationCount: 0, hasSelection: Boolean(googleLocationId) })
        continue
      }
      // An explicit selection must never silently fall back to a different business.
      const selected = googleLocationId
        ? response.locations.filter(location => googleLocationKey(location.id) === googleLocationKey(googleLocationId))
        : response.locations.length === 1 ? response.locations : []
      if (selected.length !== 1) {
        reportGoogleSync(brandId, googleLocationId ? 'SELECTED_LOCATION_NOT_FOUND' : 'LOCATION_SELECTION_REQUIRED', { locationCount: response.locations.length, hasSelection: Boolean(googleLocationId) })
        continue
      }
      const location = selected[0]
      let mapsUrl = publicHttpUrl(location.mapsUri)
      if (!mapsUrl && location.placeId?.trim()) {
        const maps = new URL('https://www.google.com/maps/search/')
        maps.searchParams.set('api', '1')
        maps.searchParams.set('query', location.name || location.placeId)
        maps.searchParams.set('query_place_id', location.placeId)
        mapsUrl = maps.href
      }
      if (mapsUrl) result[index] = { platformId: bound[index].platformId, handle: location.name || remote.handle, profileUrl: mapsUrl }
      reportGoogleSync(brandId, mapsUrl ? 'RESOLVED' : 'LOCATION_HAS_NO_PUBLIC_URL', { locationCount: response.locations.length, hasSelection: Boolean(googleLocationId) })
    }
    else if (['facebook', 'tiktok'].includes(accountPlatform(remote.platformId))) unresolved.push({ index, remote })
  }
  if (unresolved.length) {
    const posts = await cached(`${cacheKey}:posts`, () => postfastListPosts(apiKey, { status: 'published', socialMediaIds: unresolved.map(({remote}) => remote.id), limit: 50, page: 0, timeoutMs: 2_000 }))
    if (posts?.success) for (const { index, remote } of unresolved) {
      const links = new Set(posts.posts.map(post => profileFromAccountPost(remote, post)).filter((url): url is string => Boolean(url)))
      if (links.size === 1) result[index] = { platformId: bound[index].platformId, handle: remote.handle, profileUrl: [...links][0] }
    }
  }
  return result
}
