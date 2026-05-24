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
    const reviews: GoogleReview[] = rawReviews.map((r: any, i: number) => ({
      reviewId: `${placeId}_${i}_${r.time}`,
      reviewer: r.author_name ?? 'Anonymous',
      rating: r.rating ?? 0,
      comment: r.text ?? '',
      createTime: new Date(r.time * 1000).toISOString(),
    }))

    return { reviews }
  } catch (e: any) {
    return { reviews: [], error: e.message }
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
  } catch (e: any) {
    return { success: false, error: e.message }
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
 * If in mock mode, returns a mock access token immediately.
 */
export async function getGoogleAccessToken(refreshToken: string): Promise<string> {
  if (refreshToken.startsWith('mock_')) {
    return 'mock_access_token_' + Date.now();
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET is not configured in system environment.');
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
 * Returns mock locations in mock mode.
 */
export async function fetchGoogleLocations(accessToken: string): Promise<Array<{ id: string; name: string; address?: string; accountId: string }>> {
  if (accessToken.startsWith('mock_')) {
    return [
      { id: 'mock_loc_ziwei', name: '[滋味烤鱼] Google Maps', address: '23 Church St, #01-02, Capital Square, Singapore', accountId: 'mock_account_123' },
      { id: 'mock_loc_cafe', name: 'AMC Coffee Lab', address: 'Funan Mall, #02-15, Singapore', accountId: 'mock_account_123' }
    ];
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
  const locations = locData.locations ?? [];

  return locations.map((l: any) => ({
    id: l.name.split('/').pop() || l.name, // Extract location ID
    name: l.title ?? l.storefrontAddress?.name ?? 'Unnamed Store',
    address: l.storefrontAddress?.addressLines?.join(', ') ?? '',
    accountId: accountName,
  }));
}

/**
 * Fetch reviews directly from Google Business Profile API.
 * Returns mock reviews in mock mode.
 */
export async function fetchGoogleGBPReviews(
  accountId: string,
  locationId: string,
  accessToken: string
): Promise<GoogleReviewsResult> {
  if (accessToken.startsWith('mock_') || locationId.startsWith('mock_')) {
    // Generate stable, structured mock reviews for testing
    const mockReviews: GoogleReview[] = [
      {
        reviewId: 'mock_rev_001',
        reviewer: 'Zhang San (张三)',
        rating: 5,
        comment: '这里的招牌麻辣烤鱼特别赞！鱼肉非常鲜嫩，辣度也刚刚好，配菜分量很足。店里环境干净舒适，非常推荐！',
        createTime: new Date(Date.now() - 3600000 * 2).toISOString(), // 2 hours ago
      },
      {
        reviewId: 'mock_rev_002',
        reviewer: 'Li Si (李四)',
        rating: 2,
        comment: '烤鱼味道还可以，但服务态度太差了！点个饮料等了半个多小时都没上，催了几次服务员很不耐烦，体验糟糕。',
        createTime: new Date(Date.now() - 3600000 * 12).toISOString(), // 12 hours ago
      },
      {
        reviewId: 'mock_rev_003',
        reviewer: 'Wang Wu (王五)',
        rating: 4,
        comment: 'Nice Sichuan fusion style grilled fish. Spicy and aromatic. Service is decent, will visit again with friends.',
        createTime: new Date(Date.now() - 3600000 * 28).toISOString(), // 28 hours ago
        replyText: 'Thank you for your review! We look forward to serving you again soon.',
        replyTime: new Date(Date.now() - 3600000 * 27).toISOString(),
      }
    ];
    return { reviews: mockReviews };
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
    const rawReviews = data.reviews ?? [];
    
    const reviews: GoogleReview[] = rawReviews.map((r: any) => ({
      reviewId: r.reviewId,
      reviewer: r.reviewer?.displayName ?? 'Anonymous',
      rating: r.starRating === 'FIVE' ? 5 : r.starRating === 'FOUR' ? 4 : r.starRating === 'THREE' ? 3 : r.starRating === 'TWO' ? 2 : 1,
      comment: r.comment ?? '',
      createTime: r.createTime,
      replyText: r.reviewReply?.comment ?? undefined,
      replyTime: r.reviewReply?.updateTime ?? undefined,
    }));

    return { reviews };
  } catch (e: any) {
    return { reviews: [], error: e.message };
  }
}

/**
 * Post/Update a reply to a Google Business Profile review directly.
 * Simulates in mock mode.
 */
export async function replyGoogleGBPReview(input: {
  accountId: string
  locationId: string
  reviewId: string
  replyText: string
  accessToken: string
}): Promise<{ success: boolean; error?: string }> {
  if (input.accessToken.startsWith('mock_')) {
    console.log(`[Google Maps Mock OAuth] Replied to review ${input.reviewId} for location ${input.locationId} with: "${input.replyText}"`);
    return { success: true };
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
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/**
 * Create a Local Post on Google Business Profile directly.
 * Simulates in mock mode.
 */
export async function createGoogleGBPLocalPost(input: {
  accountId: string
  locationId: string
  caption: string
  mediaUrls?: string[]
  accessToken: string
}): Promise<{ success: boolean; postId?: string; url?: string; error?: string }> {
  if (input.accessToken.startsWith('mock_')) {
    console.log(`[Google Maps Mock OAuth] Created local post for location ${input.locationId} with: "${input.caption}"`);
    return {
      success: true,
      postId: 'mock_post_' + Date.now(),
      url: `https://maps.google.com/localposts/mock_${Date.now()}`
    };
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

    const postBody: Record<string, any> = {
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
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

