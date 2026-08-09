import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'

const ALLOWED_METRICS = ['plays', 'impressions', 'completions', 'likes', 'comments', 'saves', 'shares'] as const

export async function POST(request: Request) {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')
  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() || (isLocal ? 'local-internal-token' : undefined)
  if (!expectedToken || request.headers.get('x-content-service-token')?.trim() !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const brandId = text(body?.brandId)
  const projectId = text(body?.projectId)
  const variantId = text(body?.variantId)
  const platform = text(body?.platform)
  const platformPostId = text(body?.platformPostId)
  const finalAssetId = text(body?.finalAssetId) || undefined
  const windowHours = Number(body?.windowHours)
  if (!brandId || !projectId || !variantId || !platform || !platformPostId) {
    return NextResponse.json({ error: 'brandId, projectId, variantId, platform and platformPostId are required' }, { status: 400 })
  }
  if (windowHours !== 72 && windowHours !== 168) {
    return NextResponse.json({ error: 'windowHours must be 72 or 168' }, { status: 400 })
  }
  const metrics = Object.fromEntries(ALLOWED_METRICS.map((key) => [key, nonNegativeNumber(body?.metrics?.[key])]))
  const capturedAt = body?.capturedAt ? new Date(body.capturedAt) : new Date()
  if (!Number.isFinite(capturedAt.getTime())) return NextResponse.json({ error: 'capturedAt is invalid' }, { status: 400 })
  const source = text(body?.source) || 'postfast'

  const snapshot = { brandId, projectId, variantId, finalAssetId, platform, platformPostId, windowHours, metrics, source, capturedAt }
  const contentSync = await syncToContent(snapshot).catch((error) => ({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }))
  if (!contentSync.ok) {
    const message = 'error' in contentSync ? contentSync.error : 'reason' in contentSync ? contentSync.reason : 'AMC-Content snapshot sync failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
  return NextResponse.json({ success: true, snapshot: { ...snapshot, capturedAt: capturedAt.toISOString() }, contentSync, attributionScope: 'interaction_only' })
}

async function syncToContent(snapshot: {
  projectId: string
  variantId: string
  platform: string
  platformPostId: string
  windowHours: number
  metrics: Record<string, number>
  source: string
  capturedAt: Date
}) {
  const baseUrl = process.env.AMC_CONTENT_SERVICE_URL?.replace(/\/+$/, '')
  const token = process.env.AMC_CONTENT_SERVICE_TOKEN?.trim()
  if (!baseUrl || !token) return { ok: false, skipped: true, reason: 'AMC Content service is not configured' }
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-amc-actor-id': 'amc-kanban', 'x-amc-actor-role': 'ADMIN' }
  const publishResponse = await fetch(`${baseUrl}/v1/lab/video-projects/${encodeURIComponent(snapshot.projectId)}/execution-assets`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      assetType: 'PublishPackage',
      inputHash: createHash('sha256').update(JSON.stringify({
        variantId: snapshot.variantId,
        platform: snapshot.platform,
        platformPostId: snapshot.platformPostId,
      })).digest('hex'),
      status: 'published',
      payload: {
        variantId: snapshot.variantId,
        platform: snapshot.platform,
        platformPostId: snapshot.platformPostId,
        source: snapshot.source,
        published: true,
      },
    }),
    signal: AbortSignal.timeout(15000),
  })
  const publishPackage = await publishResponse.json().catch(() => null)
  if (!publishResponse.ok) throw new Error(publishPackage?.error || `AMC Content publish package sync failed with ${publishResponse.status}`)
  const publishPackageId = typeof publishPackage?.id === 'string' ? publishPackage.id : undefined
  const response = await fetch(`${baseUrl}/v1/lab/video-projects/${encodeURIComponent(snapshot.projectId)}/performance-snapshots`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      variantId: snapshot.variantId,
      platform: snapshot.platform,
      platformPostId: snapshot.platformPostId,
      windowHours: snapshot.windowHours,
      metrics: snapshot.metrics,
      source: snapshot.source,
      capturedAt: snapshot.capturedAt.toISOString(),
      parentAssetIds: publishPackageId ? [publishPackageId] : undefined,
    }),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`AMC Content snapshot sync failed with ${response.status}`)
  return { ok: true }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(0, number) : 0
}
