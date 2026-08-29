import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

export type CalendarCreativeItem = {
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
}

export type CalendarCreativeOption = {
  id: string
  date: string
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
  draftId?: string | null
}

const SYNC_MARKER_PREFIX = 'brand-plan-calendar-item:'
export const CALENDAR_PLAN_UNIMPLEMENTED_STATUS = 'planned_unimplemented'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function stringList(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function normalizePlatformSlug(value: unknown) {
  const raw = text(value).toLowerCase()
  if (['ig', 'instagram'].includes(raw)) return 'instagram'
  if (['xhs', 'rednote', 'xiaohongshu', '小红书'].includes(raw)) return 'xiaohongshu'
  if (['tiktok', 'tik tok'].includes(raw)) return 'tiktok'
  if (['google', 'google_business', 'google maps', 'google_maps', 'gbp', 'gmb'].includes(raw)) return 'google_business'
  if (['facebook', 'fb'].includes(raw)) return 'facebook'
  return raw || 'instagram'
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
  return `${SYNC_MARKER_PREFIX}${itemId}`
}

export function calendarCreativeOption(item: CalendarCreativeItem): CalendarCreativeOption | null {
  const id = text(item.id)
  const date = text(item.date)
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const platformSlug = normalizePlatformSlug(item.platformSlug || item.platform)
  const title = text(item.title) || '内容创意'
  const contentType = text(item.contentType) || '图文'
  const product = text(item.product) || '品牌内容'
  const planning = text(item.planning)
  const materialRequirements = stringList(item.materialRequirements)
  const suggestedFolder = `${date}-${slugPart(title) || id.slice(0, 8)}`
  const aiTags = Array.from(new Set([
    '内容创意素材',
    calendarSyncMarker(id),
    date,
    platformLabel(platformSlug, text(item.platform)),
    contentType,
    product,
    ...stringList(item.matchedTags).slice(0, 6),
  ]))
  const aiCaption = [
    `对应创意：${title}`,
    `计划日期：${date}`,
    `发布平台：${platformLabel(platformSlug, text(item.platform))}`,
    `内容形式：${contentType}`,
    product ? `主题产品：${product}` : '',
    planning ? `创意说明：${planning}` : '',
    materialRequirements.length ? `素材需求：${materialRequirements.join('；')}` : '',
  ].filter(Boolean).join('\n')

  return {
    id,
    date,
    title,
    platform: platformLabel(platformSlug, text(item.platform)),
    platformSlug,
    contentType,
    product,
    planning,
    materialRequirements,
    suggestedFolder: `创意素材/${suggestedFolder}`,
    aiTags,
    aiCaption,
  }
}

function scheduledAtForDate(date: string) {
  return new Date(`${date}T10:00:00.000+08:00`)
}

async function ensurePlaceholderAccount(tx: Prisma.TransactionClient, brandId: string, platformSlug: string) {
  const existing = await tx.socialAccount.findFirst({
    where: { brandId, platformId: platformSlug, handle: 'unconfigured' },
    select: { id: true },
  })
  if (existing) return existing.id
  const created = await tx.socialAccount.create({
    data: {
      brandId,
      platformId: platformSlug,
      handle: 'unconfigured',
      displayName: `${platformLabel(platformSlug)} (未配置)`,
    },
    select: { id: true },
  })
  return created.id
}

export async function syncConfirmedCalendarItemsToDrafts(brandId: string, month: string, items: CalendarCreativeItem[]) {
  const confirmed = items
    .filter((item) => !['已删除', '归档', 'archived', 'deleted'].includes(text(item.status).toLowerCase()))
    .map(calendarCreativeOption)
    .filter((item): item is CalendarCreativeOption => Boolean(item))

  if (!confirmed.length) return { syncedCount: 0 }

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let syncedCount = 0
    for (const item of confirmed) {
      const marker = calendarSyncMarker(item.id)
      const accountId = await ensurePlaceholderAccount(tx, brandId, item.platformSlug)
      const caption = `${item.title}\n\n${item.planning || item.product}`.trim()
      const agentNote = [
        marker,
        `month:${month}`,
        `platform:${item.platform}`,
        item.materialRequirements.length ? `material:${item.materialRequirements.join('；')}` : '',
      ].filter(Boolean).join('\n')
      const existing = await tx.contentDraft.findFirst({
        where: { brandId, agentNote: { contains: marker, mode: 'insensitive' } },
        select: { id: true, status: true },
      })
      if (existing && !['publishing', 'published', 'done', 'scheduled'].includes(existing.status)) {
        await tx.contentDraft.update({
          where: { id: existing.id },
          data: {
            accountId,
            caption,
            captionLang: 'zh',
            scheduledAt: scheduledAtForDate(item.date),
            status: CALENDAR_PLAN_UNIMPLEMENTED_STATUS,
            agentNote,
            creativeHooks: item.aiCaption,
            hashtags: item.aiTags.filter((tag) => !tag.includes(':')).slice(0, 12),
          },
        })
        syncedCount += 1
      } else if (!existing) {
        await tx.contentDraft.create({
          data: {
            brandId,
            accountId,
            caption,
            captionLang: 'zh',
            scheduledAt: scheduledAtForDate(item.date),
            status: CALENDAR_PLAN_UNIMPLEMENTED_STATUS,
            agentNote,
            creativeHooks: item.aiCaption,
            hashtags: item.aiTags.filter((tag) => !tag.includes(':')).slice(0, 12),
          },
        })
        syncedCount += 1
      }
    }
    return syncedCount
  })

  return { syncedCount: result }
}

export async function listOpenCalendarCreativeOptions(brandId: string, month: string) {
  const knowledge = await prisma.brandKnowledge.findUnique({
    where: { brandId },
    select: { marketingSolution: true },
  })
  const solution = knowledge?.marketingSolution as { publishingCalendar?: { months?: Record<string, CalendarCreativeItem[]> } } | null
  const items = Array.isArray(solution?.publishingCalendar?.months?.[month])
    ? solution!.publishingCalendar!.months![month]
    : []
  const options = items
    .map(calendarCreativeOption)
    .filter((item): item is CalendarCreativeOption => Boolean(item))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (!options.length) return []

  const markers = options.map((item) => calendarSyncMarker(item.id))
  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      OR: markers.map((marker) => ({ agentNote: { contains: marker, mode: 'insensitive' } })),
      status: { notIn: ['archived'] },
    },
    select: { id: true, agentNote: true, status: true },
  })
  const generated = new Map<string, string>()
  drafts.forEach((draft: { id: string; agentNote: string | null; status: string }) => {
    markers.forEach((marker) => {
      if (draft.agentNote?.includes(marker)) generated.set(marker, draft.id)
    })
  })

  const today = new Date().toISOString().slice(0, 10)
  return options
    .filter((item) => item.date >= today)
    .map((item) => ({ ...item, draftId: generated.get(calendarSyncMarker(item.id)) || null }))
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
