import { NextRequest, NextResponse } from 'next/server'
import {
  createPlatformContent,
  listContentModelProfiles,
  listPlatformCopywriters,
  listPlatformProviders,
  listVerticalSpecs,
  platformModelProfiles,
  type BrandContext,
  type CopyBrief,
  type IndustryVertical,
  type MediaAssetContext,
  type PlatformType,
} from 'amc-content'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createAmcContentModelRouter } from '@/lib/amc-content/modelRouterAdapter'
import { createPrismaKnowledgeRepository } from '@/lib/amc-content/knowledgeRepositoryAdapter'
import { createPrismaContentLogger } from '@/lib/amc-content/loggerAdapter'
import { createFilePromptTuningRepository } from '@/lib/amc-content/promptTuningRepositoryAdapter'

const platforms = ['xiaohongshu', 'instagram', 'facebook', 'google_business', 'tiktok'] as const
const verticals = [
  'food_beverage',
  'beauty_wellness',
  'fitness_pilates',
  'home_renovation',
  'pet_services',
  'education_training',
  'healthcare_clinic',
  'retail_specialty',
  'events_entertainment',
  'professional_services',
  'general_local_service',
] as const

export async function GET() {
  try {
    const session = await getSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const brands = await prisma.brand.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: {
        id: true,
        name: true,
        description: true,
        location: true,
        address: true,
        website: true,
        phone: true,
        updatedAt: true,
        knowledge: {
          select: {
            brandTone: true,
            negPrompts: true,
            slangDict: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }],
      take: 100,
    })

    return NextResponse.json({
      engine: {
        name: 'amc-content',
        enabled: process.env.AMC_CONTENT_ENGINE_ENABLED !== 'false',
        disabledByEnv: process.env.AMC_CONTENT_ENGINE_ENABLED === 'false',
      },
      brands,
      platforms: listPlatformProviders().map((provider) => ({
        platform: provider.platform,
        displayName: provider.displayName,
        defaultLanguage: provider.defaultLanguage,
        maxCaptionLength: provider.maxCaptionLength,
        hashtagRules: provider.hashtagRules,
        mediaRules: provider.mediaRules,
        requiredFields: provider.requiredFields ?? [],
        skillVersion: provider.skillVersion,
      })),
      copywriters: listPlatformCopywriters(),
      modelProfiles: listContentModelProfiles().map((profile) => ({
        id: profile.id,
        displayName: profile.displayName,
        providerId: profile.providerId,
        provider: profile.provider.provider,
        providerDisplayName: profile.provider.displayName,
        apiKeyEnv: profile.provider.apiKeyEnv,
        modelName: profile.modelName,
        temperature: profile.temperature,
        jsonMode: profile.jsonMode,
        maxTokensByTask: profile.maxTokensByTask,
        fallbackProfileIds: profile.fallbackProfileIds,
        rationale: profile.rationale,
      })),
      platformModelProfiles,
      verticals: listVerticalSpecs().map((vertical) => ({
        vertical: vertical.vertical,
        displayName: vertical.displayName,
        customerIntents: vertical.customerIntents,
        proofSignals: vertical.proofSignals,
        complianceNotes: vertical.complianceNotes,
        skillVersion: vertical.skillVersion,
      })),
    })
  } catch (error) {
    console.error('[content-lab] GET failed:', error)
    return NextResponse.json({ error: 'Failed to load content lab' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (session.user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const brandId = stringOrEmpty(body.brandId)
    const platform = normalizePlatform(body.platform)
    const industryVertical = normalizeVertical(body.industryVertical)
    const theme = stringOrEmpty(body.theme)

    if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
    if (!platform) return NextResponse.json({ error: 'Unsupported platform' }, { status: 400 })
    if (!industryVertical) return NextResponse.json({ error: 'Unsupported industryVertical' }, { status: 400 })
    if (!theme) return NextResponse.json({ error: 'theme is required' }, { status: 400 })

    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      include: { knowledge: true },
    })
    if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

    const inputBrand: BrandContext = {
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
    }

    const brief: CopyBrief = {
      industryVertical,
      theme,
      angle: optionalString(body.angle),
      customerIntent: optionalString(body.customerIntent),
      offerType: optionalString(body.offerType),
      targetEmotion: optionalString(body.targetEmotion),
      formatHint: optionalString(body.formatHint),
      locationFocus: optionalString(body.locationFocus) || brand.location || brand.address || undefined,
      localProof: stringArray(body.localProof),
      mustMention: stringArray(body.mustMention),
      mustAvoid: [...stringArray(body.mustAvoid), ...(brand.knowledge?.negPrompts ?? [])],
    }

    const startedAt = Date.now()
    const result = await createPlatformContent({
      brand: inputBrand,
      brief,
      platform,
      media: normalizeMedia(body.media),
      adapters: {
        modelRouter: createAmcContentModelRouter(),
        knowledgeRepository: createPrismaKnowledgeRepository(),
        promptTuningRepository: createFilePromptTuningRepository(),
        logger: createPrismaContentLogger(session.user.id),
      },
    })

    return NextResponse.json({
      result,
      latencyMs: Date.now() - startedAt,
    })
  } catch (error) {
    console.error('[content-lab] POST failed:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to generate content' }, { status: 500 })
  }
}

function normalizePlatform(value: unknown): PlatformType | null {
  return typeof value === 'string' && platforms.includes(value as PlatformType)
    ? value as PlatformType
    : null
}

function normalizeVertical(value: unknown): IndustryVertical | null {
  return typeof value === 'string' && verticals.includes(value as IndustryVertical)
    ? value as IndustryVertical
    : null
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function optionalString(value: unknown): string | undefined {
  const text = stringOrEmpty(value)
  return text || undefined
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => stringOrEmpty(item)).filter(Boolean)
  }
  if (typeof value === 'string') {
    return value.split('\n').map((item) => item.trim()).filter(Boolean)
  }
  return []
}

function normalizeMedia(value: unknown): MediaAssetContext[] {
  if (!Array.isArray(value)) return []
  const media: MediaAssetContext[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const url = item.trim()
      if (url) media.push({ url })
      continue
    }
    if (!item || typeof item !== 'object') continue
    const record = item as Record<string, unknown>
    const url = stringOrEmpty(record.url)
    if (!url) continue
    media.push({
      url,
      mimeType: optionalString(record.mimeType),
      tags: stringArray(record.tags),
      category: optionalString(record.category),
      caption: optionalString(record.caption),
    })
  }
  return media
}

function normalizeRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, string>
}
