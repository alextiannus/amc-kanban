import { NextResponse } from 'next/server'
import { prisma } from '@/lib/asset-analysis/db'

type Params = { params: Promise<{ id: string }> }

function authorized(request: Request) {
  const local = process.env.NODE_ENV !== 'production' || process.env.APP_BASE_URL?.includes('localhost')
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() || (local ? 'local-internal-token' : '')
  return Boolean(expected) && request.headers.get('x-content-service-token')?.trim() === expected
}

function qualityScore(value: unknown) {
  const score = Number((value as any)?.overall)
  return Number.isFinite(score) ? Math.max(0, Math.min(1, score)) : 0.5
}

function riskTypes(value: unknown): string[] {
  const items = Array.isArray((value as any)?.items) ? (value as any).items : []
  return [...new Set<string>(items.map((item: any) => String(item?.type || 'other')).filter(Boolean))]
}

export async function GET(request: Request, { params }: Params) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: brandId } = await params
  const url = new URL(request.url)
  const query = (url.searchParams.get('q') || '').trim()
  const queryTokens = [...new Set(query.split(/[\s,，。.!！?？:：;；/\\|_-]+/).map(item => item.trim()).filter(item => item.length > 1))].slice(0, 8)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit')) || 100))
  const filters: any[] = [{ OR: [{ rightsStatus: null }, { rightsStatus: { not: 'restricted' } }] }]
  if (queryTokens.length) filters.push({ OR: queryTokens.flatMap(token => [
    { searchText: { contains: token, mode: 'insensitive' as const } },
    { aiCaption: { contains: token, mode: 'insensitive' as const } },
    { aiTags: { has: token.toLowerCase() } },
  ]) })
  const assets = await prisma.mediaAsset.findMany({
    where: { brandId, AND: filters },
    include: { videoSegments: { orderBy: { startMs: 'asc' }, take: 100 } }, orderBy: [{ aiReady: 'desc' }, { createdAt: 'desc' }], take: limit,
  })
  const candidates = assets.flatMap<Record<string, unknown>>(asset => {
    const common = { assetId: asset.id, url: asset.url, mimeType: asset.mimeType, filename: asset.filename, caption: asset.aiCaption, tags: asset.aiTags, category: asset.aiCategory,
      subjects: asset.subjects, captureType: asset.captureType, qualityScore: qualityScore(asset.quality), duplicateGroupId: asset.duplicateGroupId,
      linkHealthy: (asset.linkHealth as any)?.status !== 'invalid', textRiskTypes: riskTypes(asset.textDetection), searchText: asset.searchText || asset.aiCaption || '' }
    if (asset.videoSegments.length) return asset.videoSegments.map(segment => ({ ...common, candidateId: `${asset.id}:${segment.segmentKey}`, startMs: segment.startMs, endMs: segment.endMs,
      subjects: segment.subjects || asset.subjects, captureType: segment.captureType || asset.captureType, qualityScore: qualityScore(segment.quality || asset.quality), stabilityScore: segment.stabilityScore,
      roleSuitability: segment.roleSuitability, searchText: segment.searchText || common.searchText }))
    return [{ ...common, candidateId: asset.id, roleSuitability: [] }]
  })
  return NextResponse.json({ brandId, analysisVersion: 'asset-image-video-v2', candidates })
}
