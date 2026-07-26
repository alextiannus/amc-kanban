import { NextResponse } from 'next/server'
import type { IndustryVertical, MediaAssetContext } from '@/lib/amc-content/types'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
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

  const [brand, task, media] = await Promise.all([
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
    resolveMedia(brandId, body),
  ])

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  const promotionPlan = normalizePromotionPlan(brand.knowledge?.promoPlan)

  return NextResponse.json({
    brand: {
      id: brand.id,
      name: brand.name,
      description: brand.description ?? undefined,
      tone: brand.knowledge?.brandTone ?? undefined,
      address: brand.address ?? undefined,
      location: brand.location ?? undefined,
      website: brand.website ?? undefined,
      phone: brand.phone ?? undefined,
      negativePrompts: brand.knowledge?.negPrompts ?? undefined,
      slang: normalizeRecord(brand.knowledge?.slangDict),
      promotionPlan,
    },
    briefDefaults: {
      industryVertical: optionalIndustryVertical(body.industryVertical),
      theme: stringOrEmpty(body.theme) || task?.title || task?.description || promotionPlan?.direction || brand.description || `${brand.name} local service update`,
      locationFocus: brand.location || brand.address || undefined,
      mustMention: promotionPlan?.keyMessages ?? [],
      mustAvoid: brand.knowledge?.negPrompts ?? [],
      promotionPlan,
    },
    media,
  })
}

async function resolveMedia(brandId: string, body: any): Promise<MediaAssetContext[]> {
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
        url: asset.url,
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

function optionalIndustryVertical(value: unknown): IndustryVertical | undefined {
  const text = stringOrEmpty(value)
  return text ? text as IndustryVertical : undefined
}

function normalizeRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, string>
}

function normalizePromotionPlan(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Record<string, any>
  const plan = {
    period: optionalText(raw.period),
    startDate: optionalText(raw.startDate),
    endDate: optionalText(raw.endDate),
    direction: optionalText(raw.direction),
    copywritingRequirements: optionalText(raw.copywritingRequirements),
    brandVoice: optionalText(raw.brandVoice),
    brandImage: optionalText(raw.brandImage),
    keyMessages: stringArray(raw.keyMessages),
    campaigns: Array.isArray(raw.campaigns)
      ? raw.campaigns
          .filter((campaign) => campaign && typeof campaign === 'object')
          .map((campaign) => ({
            name: optionalText(campaign.name),
            dates: optionalText(campaign.dates),
            desc: optionalText(campaign.desc),
          }))
          .filter((campaign) => campaign.name || campaign.dates || campaign.desc)
      : undefined,
  }
  return Object.values(plan).some((item) => Array.isArray(item) ? item.length > 0 : Boolean(item))
    ? plan
    : undefined
}

function optionalText(value: unknown): string | undefined {
  const text = stringOrEmpty(value)
  return text || undefined
}
