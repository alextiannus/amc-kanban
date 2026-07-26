/**
 * GET /api/brands/[id]/assets/[assetId]/stream
 *
 * Server-side proxy that fetches a media asset from OBS and streams it back
 * to the browser, solving two problems:
 *
 * 1. CORS — OBS bucket may not send the correct Access-Control headers for
 *    Range requests.  By proxying through our own origin the browser has no
 *    cross-origin issue.
 *
 * 2. Private bucket — If the OBS bucket is not public, direct <img>/<video>
 *    references fail with 403.  The server fetches with its own credentials.
 *
 * Features:
 * - Relays Range / partial-content (206) so <video> seeking works.
 * - Sets proper Content-Type from the database record (avoids octet-stream).
 * - Caches in the browser for 1 h (private so CDNs don't store user data).
 */

import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; assetId: string }> }

export async function GET(request: Request, { params }: Params) {
  // ── Auth ───────────────────────────────────────────────────────────────
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return new Response('Unauthorized', { status: 401 })
  }
  if (apiKey && !authenticatedAgent) {
    return new Response('Invalid API key', { status: 401 })
  }

  const { id: brandId, assetId } = await params

  // ── Lookup asset ────────────────────────────────────────────────────────
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, brandId },
    select: { url: true, mimeType: true, filename: true, sizeBytes: true },
  })

  if (!asset?.url) {
    return new Response('Asset not found', { status: 404 })
  }

  // ── Reject non-http URLs (local paths handled separately) ───────────────
  if (!asset.url.startsWith('http')) {
    // For local assets stored under /public, redirect — they don't need proxying.
    return NextResponse.redirect(asset.url)
  }

  // ── Relay Range header for video seeking ─────────────────────────────────
  const rangeHeader = request.headers.get('Range')
  const fetchHeaders: Record<string, string> = {}
  if (rangeHeader) {
    fetchHeaders['Range'] = rangeHeader
  }

  try {
    const upstream = await fetch(asset.url, {
      headers: fetchHeaders,
      // @ts-ignore — undici duplex requirement
      duplex: 'half',
    })

    const responseHeaders = new Headers()

    // Content-Type: always use DB value (more reliable than OBS header for mp4/mov)
    responseHeaders.set(
      'Content-Type',
      asset.mimeType || upstream.headers.get('Content-Type') || 'application/octet-stream',
    )

    // Essential for <video> seeking
    responseHeaders.set('Accept-Ranges', 'bytes')

    // Relay partial-content headers
    const contentRange = upstream.headers.get('Content-Range')
    if (contentRange) responseHeaders.set('Content-Range', contentRange)

    const contentLength = upstream.headers.get('Content-Length') || (asset.sizeBytes ? String(asset.sizeBytes) : null)
    if (contentLength) responseHeaders.set('Content-Length', contentLength)

    // Browser caches for 1 h but respects auth boundary
    responseHeaders.set('Cache-Control', 'private, max-age=3600')

    // CORS for same-site access (not needed usually since same origin, but just in case)
    responseHeaders.set('Access-Control-Allow-Origin', '*')

    return new Response(upstream.body, {
      status: upstream.status, // 200 or 206 (partial)
      headers: responseHeaders,
    })
  } catch (err: any) {
    console.error('[asset-stream] Upstream fetch failed:', err?.message)
    return new Response('Failed to fetch asset from storage', { status: 502 })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Authorization',
    },
  })
}
