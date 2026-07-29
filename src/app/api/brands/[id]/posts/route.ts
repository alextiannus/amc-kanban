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
import { postfastListPosts, postfastPublish } from '@/lib/integrations/postfast'
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
        if (
          result.code === 'MEDIA_VALIDATION_FAILED' ||
          result.code === 'MEDIA_INSPECTION_UNAVAILABLE' ||
          result.code === 'POSTFAST_PUBLISH_TIMEOUT'
        ) {
          return NextResponse.json(
            { code: result.code, error: result.error, issues: result.issues || [] },
            {
              status: result.code === 'MEDIA_VALIDATION_FAILED'
                ? 422
                : result.code === 'MEDIA_INSPECTION_UNAVAILABLE'
                  ? 503
                  : 504,
            },
          )
        }
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

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Publishing failed'
    const details = error instanceof Error && 'code' in error ? String((error as { code?: unknown }).code ?? '') : undefined
    console.error(`[Posts] Unexpected error for brand ${brandId}:`, error)
    return NextResponse.json(
      { 
        error: message,
        details: details || undefined,
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

  const url = new URL(request.url)
  const statusParam = url.searchParams.get('status')?.toLowerCase()
  const platform = url.searchParams.get('platform') || undefined
  const limitParam = Number(url.searchParams.get('limit') || '50')
  const pageParam = Number(url.searchParams.get('page') || '0')
  const status = ['scheduled', 'published', 'failed', 'draft'].includes(statusParam || '')
    ? statusParam as 'scheduled' | 'published' | 'failed' | 'draft'
    : undefined

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: { postfastApiKey: true },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (!brand.postfastApiKey) {
    return NextResponse.json({ posts: [], total: 0, engine: 'postfast', configured: false })
  }

  const result = await postfastListPosts(brand.postfastApiKey, {
    status,
    platform,
    limit: Number.isFinite(limitParam) ? limitParam : 50,
    page: Number.isFinite(pageParam) ? pageParam : 0,
  })

  if (!result.success) {
    return NextResponse.json({ error: result.error || 'Failed to list PostFast posts' }, { status: 400 })
  }

  return NextResponse.json({
    posts: result.posts,
    total: result.total ?? result.posts.length,
    engine: 'postfast',
    configured: true,
  })
}
