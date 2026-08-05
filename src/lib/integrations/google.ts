/**
 * Google Business Integration
 * Fetches reviews from Google My Business API and posts replies.
 * Brand owner configures googlePlaceId + googleApiKey in Brand Settings.
 */

export interface GoogleReview {
  reviewId: string
  reviewer: string
  rating: number          // 1–5
  comment: string
  createTime: string
  replyText?: string      // existing reply if any
  replyTime?: string
}

type PlacesApiReview = {
  author_name?: string
  rating?: number
  text?: string
  time: number
}

type GoogleLocationEntry = {
  name: string
  title?: string
  storefrontAddress?: {
    name?: string
    addressLines?: string[]
  }
}

type GoogleBusinessReviewEntry = {
  reviewId: string
  reviewer?: { displayName?: string }
  starRating?: 'ONE' | 'TWO' | 'THREE' | 'FOUR' | 'FIVE'
  comment?: string
  createTime: string
  reviewReply?: { comment?: string; updateTime?: string }
}

export interface GoogleReviewsResult {
  reviews: GoogleReview[]
  error?: string
}

/**
 * Fetch latest reviews for a Google Business place.
 * Uses Google My Business API v4.
 */
export async function fetchGoogleReviews(
  placeId: string,
  apiKey: string
): Promise<GoogleReviewsResult> {
  try {
    // Google My Business API — requires OAuth in production
    // For now we use the Places API details endpoint (public rating) as a fallback
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${apiKey}`
    const res = await fetch(url)

    if (!res.ok) return { reviews: [], error: `Google API HTTP ${res.status}` }

    const data = await res.json()
    if (data.status !== 'OK') return { reviews: [], error: data.status }

    const rawReviews = data.result?.reviews ?? []
    const reviews: GoogleReview[] = (rawReviews as PlacesApiReview[]).map((r: PlacesApiReview, i: number) => ({
      reviewId: `${placeId}_${i}_${r.time}`,
      reviewer: r.author_name ?? 'Anonymous',
      rating: r.rating ?? 0,
      comment: r.text ?? '',
      createTime: new Date(r.time * 1000).toISOString(),
    }))

    return { reviews }
  } catch (e: unknown) {
    return { reviews: [], error: e instanceof Error ? e.message : 'Google review fetch failed' }
  }
}

/**
 * Post a reply to a Google review.
 * Requires Google My Business API OAuth (not Places API).
 * In production, route through PostFast which handles OAuth complexity.
 */
export async function replyGoogleReview(input: {
  placeId: string
  reviewId: string
  replyText: string
  accessToken: string    // Google OAuth token (managed by PostFast or direct)
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Google My Business Reply API
    const url = `https://mybusiness.googleapis.com/v4/accounts/-/locations/${input.placeId}/reviews/${input.reviewId}/reply`
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: input.replyText }),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.error?.message ?? `HTTP ${res.status}` }
    }
    return { success: true }
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Google reply failed' }
  }
}

/**
 * Get place rating summary (for dashboard snapshot)
 */
export async function getPlaceRating(placeId: string, apiKey: string) {
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=rating,user_ratings_total&key=${apiKey}`
    const res = await fetch(url)
    const data = await res.json()
    return {
      rating: data.result?.rating ?? null,
      totalRatings: data.result?.user_ratings_total ?? null,
    }
  } catch {
    return { rating: null, totalRatings: null }
  }
}

/**
 * Exchange a Google Refresh Token for a fresh Access Token.
 */
export async function getGoogleAccessToken(
  refreshToken: string,
  credentials?: { clientId?: string | null; clientSecret?: string | null }
): Promise<string> {
  if (refreshToken.startsWith('mock_')) {
    throw new Error('Mock Google refresh tokens are not allowed. Connect a real Google account before using Google sync.')
  }

  let clientId = credentials?.clientId || null;
  let clientSecret = credentials?.clientSecret || null;

  // 1. If credentials are not provided, attempt to lookup brand-specific credentials using the refreshToken
  if (!clientId || !clientSecret) {
    try {
      const { prisma } = await import('../prisma')
      const brand = await prisma.brand.findFirst({
        where: { googleRefreshToken: refreshToken },
        select: { googleClientId: true, googleClientSecret: true }
      })
      if (brand?.googleClientId && brand?.googleClientSecret) {
        clientId = brand.googleClientId
        clientSecret = brand.googleClientSecret
      }
    } catch (e) {
      console.warn('Failed to lookup brand credentials by refreshToken:', e)
    }
  }

  // 2. If still not found, try loading from SystemConfig table (Admin config)
  if (!clientId || !clientSecret) {
    try {
      const { getDirectGoogleConfig } = await import('../systemConfig')
      const systemConfig = await getDirectGoogleConfig()
      if (systemConfig) {
        clientId = systemConfig.clientId
        clientSecret = systemConfig.clientSecret
      }
    } catch (e) {
      console.warn('Failed to load Google credentials from SystemConfig:', e)
    }
  }

  // 3. Fallback to process.env
  clientId = clientId || process.env.GOOGLE_CLIENT_ID || null;
  clientSecret = clientSecret || process.env.GOOGLE_CLIENT_SECRET || null;

  if (!clientId || !clientSecret) {
    throw new Error('Google OAuth Client ID or Client Secret is not configured (neither in brand settings, system config DB, nor environment variables).');
  }

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to refresh Google Access Token: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Fetch locations available under the authenticated Google Account.
 */
export async function fetchGoogleLocations(accessToken: string): Promise<Array<{ id: string; name: string; address?: string; accountId: string }>> {
  if (accessToken.startsWith('mock_')) {
    throw new Error('Mock Google access tokens are not allowed. Connect a real Google account before fetching locations.')
  }

  // 1. Fetch Accounts
  const accRes = await fetch('https://mybusiness.googleapis.com/v1/accounts', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!accRes.ok) throw new Error(`Google Accounts HTTP ${accRes.status}`);
  const accData = await accRes.json();
  const accounts = accData.accounts ?? [];
  if (accounts.length === 0) return [];

  // Pick first account
  const accountName = accounts[0].name; // e.g. "accounts/123456"

  // 2. Fetch Locations
  const locRes = await fetch(`https://mybusiness.googleapis.com/v1/${accountName}/locations`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!locRes.ok) throw new Error(`Google Locations HTTP ${locRes.status}`);
  const locData = await locRes.json();
  const locations = (locData.locations ?? []) as GoogleLocationEntry[]

  return locations.map((l: GoogleLocationEntry) => ({
    id: l.name.split('/').pop() || l.name, // Extract location ID
    name: l.title ?? l.storefrontAddress?.name ?? 'Unnamed Store',
    address: l.storefrontAddress?.addressLines?.join(', ') ?? '',
    accountId: accountName,
  }));
}

/**
 * Fetch reviews directly from Google Business Profile API.
 */
export async function fetchGoogleGBPReviews(
  accountId: string,
  locationId: string,
  accessToken: string
): Promise<GoogleReviewsResult> {
  if (accessToken.startsWith('mock_') || locationId.startsWith('mock_')) {
    return { reviews: [], error: 'Mock Google credentials are not allowed. Connect a real Google account before fetching reviews.' }
  }


  try {
    const accId = accountId.startsWith('accounts/') ? accountId : `accounts/${accountId}`;
    const locId = locationId.startsWith('locations/') ? locationId : `locations/${locationId}`;
    const url = `https://mybusiness.googleapis.com/v1/${accId}/${locId}/reviews`;
    
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    if (!res.ok) return { reviews: [], error: `Google Business API HTTP ${res.status}` };

    const data = await res.json();
    const rawReviews = data.reviews ?? []
    
    const reviews: GoogleReview[] = (rawReviews as GoogleBusinessReviewEntry[]).map((r: GoogleBusinessReviewEntry) => ({
      reviewId: r.reviewId,
      reviewer: r.reviewer?.displayName ?? 'Anonymous',
      rating: r.starRating === 'FIVE' ? 5 : r.starRating === 'FOUR' ? 4 : r.starRating === 'THREE' ? 3 : r.starRating === 'TWO' ? 2 : 1,
      comment: r.comment ?? '',
      createTime: r.createTime,
      replyText: r.reviewReply?.comment ?? undefined,
      replyTime: r.reviewReply?.updateTime ?? undefined,
    }));

    return { reviews };
  } catch (e: unknown) {
    return { reviews: [], error: e instanceof Error ? e.message : 'Google Business review fetch failed' };
  }
}

/**
 * Post/Update a reply to a Google Business Profile review directly.
 */
export async function replyGoogleGBPReview(input: {
  accountId: string
  locationId: string
  reviewId: string
  replyText: string
  accessToken: string
}): Promise<{ success: boolean; error?: string }> {
  if (input.accessToken.startsWith('mock_')) {
    return { success: false, error: 'Mock Google credentials are not allowed. Connect a real Google account before replying to reviews.' }
  }

  try {
    const accId = input.accountId.startsWith('accounts/') ? input.accountId : `accounts/${input.accountId}`;
    const locId = input.locationId.startsWith('locations/') ? input.locationId : `locations/${input.locationId}`;
    const url = `https://mybusiness.googleapis.com/v1/${accId}/${locId}/reviews/${input.reviewId}/reply`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ comment: input.replyText }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.error?.message ?? `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Google Business post failed' };
  }
}

/**
 * Create a Local Post on Google Business Profile directly.
 */
export async function createGoogleGBPLocalPost(input: {
  accountId: string
  locationId: string
  caption: string
  mediaUrls?: string[]
  accessToken: string
}): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  if (input.accessToken.startsWith('mock_')) {
    return { success: false, error: 'Mock Google credentials are not allowed. Connect a real Google account before publishing Google posts.' }
  }

  try {
    const accId = input.accountId.startsWith('accounts/') ? input.accountId : `accounts/${input.accountId}`;
    const locId = input.locationId.startsWith('locations/') ? input.locationId : `locations/${input.locationId}`;
    const url = `https://mybusiness.googleapis.com/v1/${accId}/${locId}/localPosts`;

    const media = input.mediaUrls && input.mediaUrls.length > 0
      ? input.mediaUrls.map(u => ({
          mediaFormat: 'PHOTO',
          sourceUrl: u
        }))
      : undefined;

    const postBody: Record<string, unknown> = {
      summary: input.caption,
      languageCode: 'zh-CN',
    };
    if (media) {
      postBody.media = media;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(postBody),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.error?.message ?? `HTTP ${res.status}` };
    }
    const data = await res.json();
    return {
      success: true,
      postId: data.name,
      url: data.searchUrl || undefined
    };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : 'Google Business post failed' }
  }
}
