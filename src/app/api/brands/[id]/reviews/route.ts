/**
 * Unified Review Management API
 * 
 * Route: GET /api/brands/[id]/reviews — fetch reviews from all platforms
 *        POST /api/brands/[id]/reviews/reply — reply to a review
 * 
 * This endpoint abstracts reviews from multiple sources:
 * - Google Business reviews (via PostFast or Google API)
 * - Yelp reviews
 * - Other rating platforms
 * 
 * The backend automatically detects where reviews come from and selects
 * the appropriate reply mechanism.
 */

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastReplyReview } from '@/lib/integrations/postfast'

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
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      googleApiKey: true,
      googlePlaceId: true,
    }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  try {
    const allReviews: any[] = []

    // ═══════════════════════════════════════════════════════════════════════════
    // Fetch from PostFast (covers Google Business via PostFast, Yelp, etc.)
    // ═══════════════════════════════════════════════════════════════════════════
    if (brand.postfastApiKey) {
      // TODO: Implement postfastGetReviews function
      // This would fetch reviews from PostFast API
      // const pfReviews = await postfastGetReviews(brand.postfastApiKey)
      // allReviews.push(...pfReviews)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Fetch from Google API directly (future)
    // ═══════════════════════════════════════════════════════════════════════════
    // if (brand.googleApiKey && brand.googlePlaceId) {
    //   const googleReviews = await getGooglePlaceReviews(...)
    //   allReviews.push(...googleReviews)
    // }

    return NextResponse.json({
      ok: true,
      total: allReviews.length,
      reviews: allReviews,
    })

  } catch (error: any) {
    console.error(`[Reviews] Failed to fetch reviews for brand ${brandId}:`, error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch reviews' },
      { status: 500 }
    )
  }
}

// POST /api/brands/[id]/reviews/reply
// Reply to a customer review
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      postfastApiKey: true,
      googleApiKey: true,
      googlePlaceId: true,
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
    // ═══════════════════════════════════════════════════════════════════════════
    // Backend Selection Logic
    // ═══════════════════════════════════════════════════════════════════════════
    // Try to use the specified platform, or auto-detect
    const detectedPlatform = (platform || 'google') as 'google' | 'yelp' // PostFast currently supports these

    if (brand.postfastApiKey) {
      // PostFast handles replies for Google, Yelp, and other platforms
      const result = await postfastReplyReview({
        apiKey: brand.postfastApiKey,
        platform: detectedPlatform,
        reviewId,
        replyText,
      })

      if (!result.success) {
        console.error(`[Reviews] PostFast reply failed for brand ${brandId}:`, result.error)
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

    // ═══════════════════════════════════════════════════════════════════════════
    // Future: Direct Platform APIs
    // if (detectedPlatform === 'google' && brand.googleApiKey && brand.googlePlaceId) {
    //   return replyViaGoogleAPI(...)
    // }
    // ═══════════════════════════════════════════════════════════════════════════

    return NextResponse.json(
      {
        error: 'No review reply backend configured for this brand',
        hint: 'Configure PostFast API Key or platform-specific credentials in brand settings',
      },
      { status: 400 }
    )

  } catch (error: any) {
    console.error(`[Reviews] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json(
      {
        error: error.message || 'Reply failed',
        details: error.code || undefined,
      },
      { status: 500 }
    )
  }
}
