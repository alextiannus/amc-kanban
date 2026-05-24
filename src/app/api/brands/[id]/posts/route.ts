/**
 * Unified Social Media Publishing API
 * 
 * Route: POST /api/brands/[id]/posts/publish
 * 
 * This endpoint abstracts the underlying publishing engine (PostFast, native APIs, etc.).
 * Clients call this unified API and the backend automatically selects the appropriate
 * publishing backend based on brand configuration.
 * 
 * Benefits:
 * - AI Agents don't need to know about PostFast, Google API, etc.
 * - Easy to switch publishing backends without changing Agent code
 * - Centralized error handling and retry logic
 */

import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { postfastPublish } from '@/lib/integrations/postfast'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

interface PublishPostRequest {
  platform: string          // instagram, tiktok, xiaohongshu, google, facebook, youtube, etc.
  caption: string           // post content
  mediaStorageKeys?: string[] // from upload_asset or postfast_upload_media
  mediaUrls?: string[]      // fallback if no storage keys
  hashtags?: string[]       // optional hashtags
  scheduledAt?: string      // ISO 8601 UTC time for scheduling (e.g., "2026-06-01T03:00:00Z")
  accountId?: string        // specific account to post from (optional, uses default if not specified)
}

// POST /api/brands/[id]/posts/publish
// Unified endpoint to publish content across social media platforms
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

  let user = session?.user
  if (apiKey && authenticatedAgent) {
    user = {
      id: authenticatedAgent.id,
      email: authenticatedAgent.email,
      type: authenticatedAgent.type,
      role: 'USER',
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params
  const ok = await canSessionAccessBrandProject(brandId, user.id, user.type ?? 'HUMAN', user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Get brand and verify it exists and user has access
  const brand = await prisma.brand.findFirst({ 
    where: { id: brandId },
    select: { 
      postfastApiKey: true,
      googleApiKey: true,
      googlePlaceId: true,
      googlePreferOAuth: true,
      googleRefreshToken: true,
      googleAccountId: true,
      googleLocationId: true,
    }
  })

  if (!brand) {
    return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  }

  const body: PublishPostRequest = await request.json()
  const { platform, caption, mediaStorageKeys, mediaUrls, hashtags, scheduledAt, accountId } = body

  // Validate required fields
  if (!platform || !caption) {
    return NextResponse.json(
      { error: 'platform and caption are required' },
      { status: 400 }
    )
  }

  try {
    // ═══════════════════════════════════════════════════════════════════════════
    // Backend Selection Logic
    // ═══════════════════════════════════════════════════════════════════════════
    // In Phase 2+, we can expand this to support multiple backends:
    // - Direct platform APIs (Twitter API v2, Instagram Graph API, etc.)
    // - TikTok Shop API
    // - Custom publishing workflows
    //
    // ═══════════════════════════════════════════════════════════════════════════

    const isDirectGoogle = platform === 'google' && brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId

    if (isDirectGoogle) {
      try {
        const { getGoogleAccessToken, createGoogleGBPLocalPost } = await import('@/lib/integrations/google')
        const accessToken = await getGoogleAccessToken(brand.googleRefreshToken!)
        
        let googleAccountId = brand.googleAccountId || 'primary'
        let googleLocationId = brand.googleLocationId!
        
        if (accountId) {
          const targetAccount = await prisma.socialAccount.findFirst({
            where: { id: accountId, brandId },
            select: { platformId: true, handle: true },
          })
          if (targetAccount && targetAccount.platformId === 'google') {
            const handle = targetAccount.handle
            const match = handle.match(/accounts\/([^\/]+)\/locations\/([^\/]+)/)
            if (match) {
              googleAccountId = `accounts/${match[1]}`
              googleLocationId = match[2]
            } else {
              googleLocationId = handle
            }
          }
        }

        const result = await createGoogleGBPLocalPost({
          accountId: googleAccountId,
          locationId: googleLocationId,
          caption,
          mediaUrls,
          accessToken,
        })

        if (!result.success) {
          console.error(`[Posts] Direct Google publish failed for brand ${brandId}:`, result.error)
          return NextResponse.json(
            { error: result.error || 'Failed to publish to Google' },
            { status: 400 }
          )
        }

        return NextResponse.json({
          ok: true,
          postId: result.postId,
          platform: platform,
          url: result.url,
          scheduledAt: 'immediate',
          engine: 'google_direct',
        })
      } catch (e: any) {
        console.error(`[Posts] Direct Google publish error for brand ${brandId}:`, e)
        return NextResponse.json(
          { error: e.message || 'Direct Google GBP publish failed' },
          { status: 500 }
        )
      }
    }

    if (brand.postfastApiKey) {
      // Route to PostFast (supports 15+ platforms)
      const result = await postfastPublish({
        apiKey: brand.postfastApiKey,
        platform,
        caption,
        mediaStorageKeys,
        mediaUrls,
        hashtags,
        scheduledAt,
        accountId,
      })

      if (!result.success) {
        console.error(`[Posts] PostFast publish failed for brand ${brandId}:`, result.error)
        return NextResponse.json(
          { error: result.error || 'Failed to publish' },
          { status: 400 }
        )
      }

      return NextResponse.json({
        ok: true,
        postId: result.postId,
        platform: platform,
        url: result.url,
        scheduledAt: result.scheduledAt || scheduledAt,
        engine: 'postfast', // Transparent: tell client which engine was used
      })
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Future: Direct Platform APIs
    // else if (platform === 'google' && brand.googleApiKey && brand.googlePlaceId) {
    //   return publishViaGoogleAPI(...)
    // }
    // else if (platform === 'twitter') {
    //   return publishViaTwitterAPI(...)
    // }
    // ═══════════════════════════════════════════════════════════════════════════

    // No publishing backend is configured
    return NextResponse.json(
      { 
        error: 'No publishing backend configured for this brand',
        hint: 'Configure PostFast API Key or platform-specific credentials in brand settings',
      },
      { status: 400 }
    )

  } catch (error: any) {
    console.error(`[Posts] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json(
      { 
        error: error.message || 'Publishing failed',
        details: error.code || undefined,
      },
      { status: 500 }
    )
  }
}

// GET /api/brands/[id]/posts
// List published or scheduled posts (future endpoint)
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

  let user = session?.user
  if (apiKey && authenticatedAgent) {
    user = {
      id: authenticatedAgent.id,
      email: authenticatedAgent.email,
      type: authenticatedAgent.type,
      role: 'USER',
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: brandId } = await params
  const ok = await canSessionAccessBrandProject(brandId, user.id, user.type ?? 'HUMAN', user.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // TODO: Implement list posts endpoint
  // - Query PostFast for scheduled/published posts
  // - Merge with any native platform data
  // - Return unified format
  
  return NextResponse.json({ error: 'Not implemented' }, { status: 501 })
}
