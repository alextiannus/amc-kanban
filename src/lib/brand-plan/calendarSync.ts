import { prisma } from '@/lib/prisma'
import { creativeWorkspace, monthItems, revisionPeriod, CREATIVE_REVISION_KIND } from './creativeRevisionContract.ts'
import { normalizeCreativeWorkspaceItem, type CreativeWorkspaceItem } from './creativeWorkspaceContract.ts'
import { creativeDraftMarker, creativeDraftMarkerSearches, hasCreativeDraftMarker } from './creativeDraftMarker.ts'

export type CalendarCreativeItem = {
  nativeDaily?: {poolIdeaId:string;taskId:string}
  nativeReviewStatus?: string
  legacy?: {date?:string;platform?:string;status?:string}
  platformTargets?: string[]
  schedule?: {draftId?:string} | null
  id?: string
  date?: string
  title?: string
  platform?: string
  platformSlug?: string
  contentType?: string
  product?: string
  planning?: string
  status?: string
  materialRequirements?: string[]
  matchedTags?: string[]
  aiTags?: string[]
  aiCaption?: string
  postfastControls?: Record<string, unknown>
  productionFormats?: Array<'post' | 'video'>
}

export type CalendarCreativeOption = {
  nativeDaily?: {poolIdeaId:string;taskId:string}
  nativeReviewStatus?: string
  id: string
  date: string | null
  title: string
  platform: string
  platformSlug: string
  contentType: string
  product: string
  planning: string
  materialRequirements: string[]
  suggestedFolder: string
  aiTags: string[]
  aiCaption: string
  postfastControls?: Record<string, unknown>
  productionFormats?: Array<'post' | 'video'>
  draftId?: string | null
  workspaceItem?: CreativeWorkspaceItem
}

export const CALENDAR_PLAN_UNIMPLEMENTED_STATUS = 'planned_unimplemented'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function normalizePlatformSlug(value: unknown) {
  const raw = text(value).toLowerCase()
  if (['ig', 'instagram'].includes(raw)) return 'instagram'
  if (['xhs', 'rednote', 'xiaohongshu', '小红书'].includes(raw)) return 'xiaohongshu'
  if (['tiktok', 'tik tok'].includes(raw)) return 'tiktok'
  if (['google', 'google_business', 'google maps', 'google_maps', 'gbp', 'gmb'].includes(raw)) return 'google_business'
  if (['facebook', 'fb'].includes(raw)) return 'facebook'
  return raw
}

function platformLabel(slug: string, fallback?: string) {
  if (slug === 'instagram') return 'Instagram'
  if (slug === 'xiaohongshu') return '小红书'
  if (slug === 'tiktok') return 'TikTok'
  if (slug === 'google_business') return 'Google Business'
  if (slug === 'facebook') return 'Facebook'
  return fallback || slug
}

function contentTypeFolder(contentType: string) {
  if (contentType.includes('视频')) return '视频原片'
  if (contentType.includes('活动') || contentType.includes('节日')) return '活动'
  return '产品'
}

function slugPart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

export function calendarSyncMarker(itemId: string) {
  return creativeDraftMarker('calendar',itemId)
}

export function calendarCreativeOption(item: CalendarCreativeItem): CalendarCreativeOption | null {
  if(['archived','deleted','归档','已删除'].includes(text(item.status).toLowerCase()))return null
  const id = text(item.id)
  const date = text(item.legacy?.date || item.date)
  if (!id) return null
  const platform = text(item.platformTargets?.[0] || item.platform || item.legacy?.platform)
  const platformSlug = normalizePlatformSlug(item.platformSlug || platform)
  const title = text(item.title) || '内容创意'
  const contentType = text(item.contentType) || '图文'
  const product = text(item.product) || '品牌内容'
  const planning = text(item.planning)
  const materialRequirements = stringList(item.materialRequirements)
  const suggestedFolder = `${date ? `${date}-` : ''}${slugPart(title) || id.slice(0, 8)}`
  const storedAiTags = stringList(item.aiTags)
  const aiTags = Array.from(new Set([
    '内容创意素材',
    calendarSyncMarker(id),
    ...(date ? [date] : []),
    ...(platform ? [platformLabel(platformSlug, platform)] : []),
    contentType,
    product,
    ...stringList(item.matchedTags).slice(0, 6),
    ...storedAiTags,
  ]))
  const aiCaption = text(item.aiCaption) || [
    `对应创意：${title}`,
    date ? `计划日期：${date}` : '',
    platform ? `发布平台：${platformLabel(platformSlug, platform)}` : '',
    `内容形式：${contentType}`,
    product ? `主题产品：${product}` : '',
    planning ? `创意说明：${planning}` : '',
    materialRequirements.length ? `素材需求：${materialRequirements.join('；')}` : '',
  ].filter(Boolean).join('\n')

  return {
    id,
    date: date || null,
    title,
    platform: platform ? platformLabel(platformSlug, platform) : '',
    platformSlug,
    contentType,
    product,
    planning,
    materialRequirements,
    nativeDaily:item.nativeDaily,
    nativeReviewStatus:item.nativeReviewStatus,
    suggestedFolder: `创意素材/${suggestedFolder}`,
    aiTags,
    aiCaption,
    postfastControls: objectValue(item.postfastControls),
    productionFormats: item.productionFormats,
    draftId: text(item.schedule?.draftId) || null,
  }
}

export async function syncConfirmedCalendarItemsToDrafts(brandId: string, month: string, items: CalendarCreativeItem[], db = prisma) {
  // Plan generation and creative approval do not authorize publishing. The
  // schedule endpoint owns draft creation; this legacy hook remains for callers
  // until their calendar workflow is migrated.
  void brandId; void month; void items; void db
  return { syncedCount: 0 }
}

export async function listOpenCalendarCreativeOptions(brandId: string, month: string, db = prisma) {
  const knowledge = await db.brandKnowledge.findUnique({
    where: { brandId },
    select: { marketingSolution: true, brandPlan: true },
  })
  const items = monthItems(creativeWorkspace(knowledge),month) as CalendarCreativeItem[]
  const options = items
    .map(calendarCreativeOption)
    .filter((item): item is CalendarCreativeOption => Boolean(item))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))

  if (!options.length) return []

  // Marker lookup only projects historical dated plans. New undated ideas
  // receive draft links solely from the explicit scheduling transaction.
  const legacyOptions = options.filter(item => item.date && !item.draftId)
  const markers = legacyOptions.flatMap(item => creativeDraftMarkerSearches('calendar',item.id))
  const revisions = await db.brandMarketingSolution.findMany({
    where: { brandId, kind: CREATIVE_REVISION_KIND, period: { in: options.map(item => revisionPeriod(month,item.id)) } },
    orderBy: { version: 'desc' },
    select: { id: true, period: true, createdAt: true },
  })
  const latest = new Map<string,{id:string;createdAt:Date}>()
  for (const row of revisions) if (!latest.has(row.period)) latest.set(row.period,row)
  const drafts = markers.length ? await db.contentDraft.findMany({
    where: {
      brandId,
      OR: markers.map((marker) => ({ agentNote: { contains: marker, mode: 'insensitive' } })),
      status: { notIn: ['archived'] },
    },
    select: { id: true, agentNote: true, status: true },
  }) : []
  const generated = new Map<string, string>()
  drafts.forEach((draft: { id: string; agentNote: string | null; status: string }) => {
    legacyOptions.forEach((item) => {
      if (hasCreativeDraftMarker(draft.agentNote,'calendar',item.id)) generated.set(calendarSyncMarker(item.id), draft.id)
    })
  })

  return options.map((item) => {
    const raw = items.find(value => value.id === item.id)
    const revision = latest.get(revisionPeriod(month,item.id))
    return { ...item, draftId: item.draftId || (item.date ? generated.get(calendarSyncMarker(item.id)) : null) || null,
      workspaceItem: normalizeCreativeWorkspaceItem(raw,{brandId,currentRevisionId:revision?.id,updatedAt:revision?.createdAt.toISOString()}) }
  })
}

export async function submitAssetToCalendarCreativeRequirement(input: {
  brandId: string
  creativeId?: string | null
  assetId: string
  submittedBy?: string | null
}) {
  const creativeId = text(input.creativeId)
  if (!creativeId) return { submitted: false }
  const requirement = await prisma.materialRequirement.findFirst({
    where: {
      brandId: input.brandId,
      remotePlanItemId: creativeId,
      requirementKey: 'brand-plan-calendar:primary',
      required: true,
    },
    select: { id: true },
  })
  if (!requirement) {
    console.warn('[calendarSync] Material requirement not found for creative asset submission', {
      brandId: input.brandId,
      creativeId,
      assetId: input.assetId,
    })
    return { submitted: false }
  }
  await prisma.$transaction([
    prisma.materialSubmission.upsert({
      where: {
        requirementId_assetId: {
          requirementId: requirement.id,
          assetId: input.assetId,
        },
      },
      create: {
        requirementId: requirement.id,
        assetId: input.assetId,
        submittedBy: input.submittedBy || undefined,
      },
      update: {
        status: 'SUBMITTED',
        submittedBy: input.submittedBy || undefined,
      },
    }),
    prisma.materialRequirement.update({
      where: { id: requirement.id },
      data: { status: 'SUBMITTED' },
    }),
  ])
  return { submitted: true }
}
