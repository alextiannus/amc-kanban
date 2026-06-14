/**
 * Unified Review Management API
 * 
 * Route: GET /api/brands/[id]/reviews — fetch reviews from all platforms
 *        POST /api/brands/[id]/reviews/reply — reply to a review
 */

import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastReplyReview } from '@/lib/integrations/postfast'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { fetchGoogleGBPReviews, fetchGoogleReviews, getGoogleAccessToken, replyGoogleGBPReview } from '@/lib/integrations/google'

type Params = { params: Promise<{ id: string }> }

interface ReplyRequest {
  reviewId: string    // unique review identifier
  platform?: string   // 'google', 'yelp', etc. (auto-detected if not specified)
  replyText: string   // the reply message
}

// GET /api/brands/[id]/reviews
// Fetch reviews from all configured platforms
export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id: brandId } = await params

  let userId: string
  let userType: string
  let userRole: string

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type ?? 'HUMAN'
    userRole = session.user.role
  } else {
    userId = authenticatedAgent!.id
    userType = 'AI_AGENT'
    userRole = 'USER'
  }

  const ok = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      googleApiKey: true,
      googlePlaceId: true,
      googleRefreshToken: true,
      googleAccountId: true,
      googleLocationId: true,
      googlePreferOAuth: true,
    }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const limit = url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 10

  try {
    let allReviews: any[] = []

    // 1. Google Business Profile OAuth2 Flow (Preferred)
    if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
      try {
        const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
        const result = await fetchGoogleGBPReviews(brand.googleAccountId || 'primary', brand.googleLocationId, accessToken)
        if (!result.error && result.reviews) {
          allReviews = result.reviews.slice(0, limit)
        }
      } catch (e) {
        console.error('[API Reviews] GBP OAuth flow reviews fetch failed:', e)
      }
    }

    // 2. Google Places API Key Flow (Fallback)
    if (allReviews.length === 0 && brand.googlePlaceId && brand.googleApiKey) {
      try {
        const result = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
        if (!result.error && result.reviews) {
          allReviews = result.reviews.slice(0, limit)
        }
      } catch (e) {
        console.error('[API Reviews] Places API reviews fetch failed:', e)
      }
    }

    return NextResponse.json({
      ok: true,
      total: allReviews.length,
      reviews: allReviews,
    })

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch reviews'
    console.error(`[Reviews] Failed to fetch reviews for brand ${brandId}:`, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// POST /api/brands/[id]/reviews/reply
// Reply to a customer review
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (apiKey && !authenticatedAgent) {
    return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
  }

  const { id: brandId } = await params

  let userId: string
  let userType: string
  let userRole: string

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type ?? 'HUMAN'
    userRole = session.user.role
  } else {
    userId = authenticatedAgent!.id
    userType = 'AI_AGENT'
    userRole = 'USER'
  }

  const ok = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      googleRefreshToken: true,
      googleAccountId: true,
      googleLocationId: true,
      googlePreferOAuth: true,
    }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const body: ReplyRequest = await request.json()
  const { reviewId, platform, replyText } = body

  if (!reviewId || !replyText) {
    return NextResponse.json(
      { error: 'reviewId and replyText are required' },
      { status: 400 }
    )
  }

  try {
    const detectedPlatform = (platform || 'google').toLowerCase() as 'google' | 'yelp'

    // Direct Google GBP OAuth reply if configured
    if (detectedPlatform === 'google' && brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
      try {
        const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
        const result = await replyGoogleGBPReview({
          accountId: brand.googleAccountId || 'primary',
          locationId: brand.googleLocationId,
          reviewId,
          replyText,
          accessToken,
        })
        if (result.success) {
          return NextResponse.json({
            ok: true,
            reviewId,
            platform: detectedPlatform,
            replied: true,
            via: 'direct_oauth',
          })
        }
      } catch (e) {
        console.error('[API Reviews] Google OAuth reply failed, falling back to PostFast...', e)
      }
    }

    if (brand.postfastApiKey) {
      const result = await postfastReplyReview({
        apiKey: brand.postfastApiKey,
        platform: detectedPlatform,
        reviewId,
        replyText,
      })

      if (!result.success) {
        return NextResponse.json(
          { error: result.error || 'Failed to post reply' },
          { status: 400 }
        )
      }

      return NextResponse.json({
        ok: true,
        reviewId,
        platform: detectedPlatform,
        replied: true,
        engine: 'postfast',
      })
    }

    return NextResponse.json(
      {
        error: 'No review reply backend configured for this brand',
        hint: 'Configure PostFast API Key or platform-specific credentials in brand settings',
      },
      { status: 400 }
    )

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Reply failed'
    console.error(`[Reviews] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
