/**
 * Meta (Facebook & Instagram) Direct Integration Helper
 * Interface with the Meta Graph API v20.0
 */

export interface MetaPageEntry {
  id: string
  name: string
  access_token: string
}

export interface MetaInstagramEntry {
  id: string
  username: string
  name: string
  profilePictureUrl?: string
  followersCount?: number
  linkedPageId: string
  pageAccessToken: string
}

/**
 * Exchange Meta OAuth Code for a Long-Lived User Access Token (valid for 60 days).
 */
export async function exchangeMetaCodeForUserToken(input: {
  code: string
  redirectUri: string
  appId: string
  appSecret: string
}): Promise<string> {
  const { code, redirectUri, appId, appSecret } = input

  // 1. Get Short-Lived User Access Token
  const shortLivedUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token')
  shortLivedUrl.searchParams.set('client_id', appId)
  shortLivedUrl.searchParams.set('redirect_uri', redirectUri)
  shortLivedUrl.searchParams.set('client_secret', appSecret)
  shortLivedUrl.searchParams.set('code', code)

  const shortRes = await fetch(shortLivedUrl.toString())
  if (!shortRes.ok) {
    const errData = await shortRes.json().catch(() => ({}))
    throw new Error(errData.error?.message || `Failed to fetch short-lived user token: HTTP ${shortRes.status}`)
  }
  const shortData = await shortRes.json()
  const shortToken = shortData.access_token

  // 2. Exchange for Long-Lived User Access Token
  const longLivedUrl = new URL('https://graph.facebook.com/v20.0/oauth/access_token')
  longLivedUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longLivedUrl.searchParams.set('client_id', appId)
  longLivedUrl.searchParams.set('client_secret', appSecret)
  longLivedUrl.searchParams.set('fb_exchange_token', shortToken)

  const longRes = await fetch(longLivedUrl.toString())
  if (!longRes.ok) {
    const errData = await longRes.json().catch(() => ({}))
    throw new Error(errData.error?.message || `Failed to exchange for long-lived user token: HTTP ${longRes.status}`)
  }
  const longData = await longRes.json()
  return longData.access_token
}

/**
 * Fetch all Facebook Pages authorized by this User Access Token.
 * Returns the page name, ID, and its non-expiring Page Access Token.
 */
export async function fetchMetaPages(userAccessToken: string): Promise<MetaPageEntry[]> {
  const url = new URL('https://graph.facebook.com/v20.0/me/accounts')
  url.searchParams.set('fields', 'id,name,access_token')
  url.searchParams.set('limit', '100')
  url.searchParams.set('access_token', userAccessToken)

  const res = await fetch(url.toString())
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}))
    throw new Error(errData.error?.message || `Failed to fetch Facebook Pages: HTTP ${res.status}`)
  }
  const data = await res.json()
  const pages = data.data || []

  return pages.map((p: any) => ({
    id: p.id,
    name: p.name,
    access_token: p.access_token,
  }))
}

/**
 * Checks if a Facebook Page has a linked Instagram Business Account,
 * and if so, retrieves its details using the Page Access Token.
 */
export async function fetchLinkedInstagramAccount(input: {
  pageId: string
  pageAccessToken: string
}): Promise<MetaInstagramEntry | null> {
  const { pageId, pageAccessToken } = input

  // 1. Get linked Instagram Business Account ID
  const pageUrl = new URL(`https://graph.facebook.com/v20.0/${pageId}`)
  pageUrl.searchParams.set('fields', 'instagram_business_account')
  pageUrl.searchParams.set('access_token', pageAccessToken)

  const pageRes = await fetch(pageUrl.toString())
  if (!pageRes.ok) {
    const errData = await pageRes.json().catch(() => ({}))
    console.warn(`[Meta Integration] Failed to check IG linked to page ${pageId}:`, errData.error?.message || pageRes.status)
    return null
  }
  const pageData = await pageRes.json()
  const igAccount = pageData.instagram_business_account
  if (!igAccount || !igAccount.id) {
    return null
  }

  const igId = igAccount.id

  // 2. Fetch Instagram Business Profile details
  const igUrl = new URL(`https://graph.facebook.com/v20.0/${igId}`)
  igUrl.searchParams.set('fields', 'username,name,profile_picture_url,followers_count')
  igUrl.searchParams.set('access_token', pageAccessToken)

  const igRes = await fetch(igUrl.toString())
  if (!igRes.ok) {
    const errData = await igRes.json().catch(() => ({}))
    console.warn(`[Meta Integration] Failed to fetch IG account details for ${igId}:`, errData.error?.message || igRes.status)
    // Fallback to basic entry without details
    return {
      id: igId,
      username: `instagram_biz_${igId}`,
      name: 'Instagram Business Account',
      linkedPageId: pageId,
      pageAccessToken: pageAccessToken,
    }
  }

  const igData = await igRes.json()
  return {
    id: igId,
    username: igData.username || `instagram_biz_${igId}`,
    name: igData.name || igData.username || 'Instagram Business Account',
    profilePictureUrl: igData.profile_picture_url || undefined,
    followersCount: typeof igData.followers_count === 'number' ? igData.followers_count : undefined,
    linkedPageId: pageId,
    pageAccessToken: pageAccessToken,
  }
}
