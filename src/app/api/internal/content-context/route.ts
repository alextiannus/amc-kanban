import { NextResponse } from 'next/server'
import type { IndustryVertical, MediaAssetContext } from '@/lib/amc-content/types'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { buildBrandContext } from '@/lib/brandContextBuilder'
import { prisma } from '@/lib/prisma'

export const maxDuration = 30

export async function POST(request: Request) {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')

  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
    || (isLocal ? 'local-internal-token' : undefined)
  const suppliedToken = request.headers.get('x-content-service-token')?.trim()
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const brandId = stringOrEmpty(body.brandId)
  const actorId = stringOrEmpty(body.actorId)
  const actorType = stringOrEmpty(body.actorType) || 'HUMAN'
  const actorRole = stringOrEmpty(body.actorRole) || 'USER'

  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  if (!actorId) return NextResponse.json({ error: 'actorId is required' }, { status: 400 })

  const ok = await canSessionAccessBrandProject(brandId, actorId, actorType, actorRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [brand, task, media, brandContext] = await Promise.all([
    prisma.brand.findUnique({
      where: { id: brandId },
      include: { knowledge: true },
    }),
    body.taskId
      ? prisma.workUnit.findUnique({
          where: { id: stringOrEmpty(body.taskId) },
          select: { title: true, description: true },
        })
      : Promise.resolve(null),
    resolveMedia(brandId, body, new URL(request.url).origin),
    buildBrandContext(brandId),
  ])

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  const mediaProof = media
    .flatMap((item) => [
      item.caption,
      item.category,
      ...(item.tags ?? []),
    ])
    .map((item) => stringOrEmpty(item))
    .filter(Boolean)
    .slice(0, 20)

  return NextResponse.json({
    brand: {
      id: brand.id,
      growthBrandKey: brand.growthBrandKey ?? undefined,
      name: brand.name,
      description: brand.description ?? undefined,
      tone: brandContext.brandTone || undefined,
      contextText: brandContext.contextText || undefined,
      audience: brandContext.audience || undefined,
      sellingPoints: brandContext.sellingPoints.length ? brandContext.sellingPoints : undefined,
      address: brand.address ?? undefined,
      location: brand.location ?? undefined,
      website: brand.website ?? undefined,
      phone: brand.phone ?? undefined,
      negativePrompts: brand.knowledge?.negPrompts ?? undefined,
      slang: normalizeRecord(brand.knowledge?.slangDict),
      menuItems: normalizeMenuItems(brand.knowledge?.menuItems),
      stores: normalizeStores(brand.knowledge?.stores),
      promotionPlan: undefined,
    },
    briefDefaults: {
      industryVertical: optionalIndustryVertical(body.industryVertical),
      theme: stringOrEmpty(body.theme) || task?.title || task?.description || brand.description || `${brand.name} local service update`,
      locationFocus: brand.location || brand.address || undefined,
      mustMention: [],
      mustAvoid: brand.knowledge?.negPrompts ?? [],
      localProof: mediaProof,
      promotionPlan: undefined,
    },
    media,
  })
}

async function resolveMedia(brandId: string, body: any, requestOrigin: string): Promise<MediaAssetContext[]> {
  const mediaUrls = stringArray(body.mediaUrls)
  const assetIds = stringArray(body.assetIds)
  const byUrl = new Map<string, MediaAssetContext>()

  if (assetIds.length || mediaUrls.length) {
    const assets = await prisma.mediaAsset.findMany({
      where: {
        brandId,
        OR: [
          ...(assetIds.length ? [{ id: { in: assetIds } }] : []),
          ...(mediaUrls.length ? [{ url: { in: mediaUrls } }] : []),
        ],
      },
    })
    for (const asset of assets) {
      byUrl.set(asset.url, {
        id: asset.id,
        url: readableMediaUrl(brandId, asset, requestOrigin),
        mimeType: asset.mimeType,
        tags: asset.aiTags,
        category: asset.aiCategory ?? undefined,
        caption: asset.aiCaption ?? undefined,
      })
    }
  }

  for (const url of mediaUrls) {
    if (!byUrl.has(url)) byUrl.set(url, { url })
  }

  return Array.from(byUrl.values())
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => stringOrEmpty(item)).filter(Boolean)
  if (typeof value === 'string') return value.split('\n').map((item) => item.trim()).filter(Boolean)
  return []
}

function readableMediaUrl(brandId: string, asset: { url: string; sourceType?: string | null }, requestOrigin: string) {
  let value = asset.url
  if (!value.startsWith('http') && !value.startsWith('/') && asset.sourceType === 'postfast') {
    value = `/api/integrations/postfast/file/${encodeURIComponent(brandId)}/${encodeURIComponent(value)}`
  }
  if (value.startsWith('/')) {
    const base = process.env.APP_BASE_URL?.replace(/\/+$/, '') || requestOrigin
    return base ? `${base}${value}` : value
  }
  return value
}

function optionalIndustryVertical(value: unknown): IndustryVertical | undefined {
  const text = stringOrEmpty(value)
  return text ? text as IndustryVertical : undefined
}

function normalizeRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, string>
}

function normalizeMenuItems(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const items = value
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      name: optionalText(item.name),
      price: optionalText(item.price),
      description: optionalText(item.description),
    }))
    .filter((item) => item.name || item.description)
    .slice(0, 20)
  return items.length ? items : undefined
}

function normalizeStores(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const stores = value
    .filter((item) => item && typeof item === 'object')
    .map((item: any) => ({
      name: optionalText(item.name),
      address: optionalText(item.address),
      phone: optionalText(item.phone),
      businessHours: optionalText(item.businessHours),
      reservationUrl: optionalText(item.reservationUrl),
      orderingUrl: optionalText(item.orderingUrl),
    }))
    .filter((item) => item.name || item.address || item.phone || item.businessHours)
    .slice(0, 10)
  return stores.length ? stores : undefined
}

function optionalText(value: unknown): string | undefined {
  const text = stringOrEmpty(value)
  return text || undefined
}
