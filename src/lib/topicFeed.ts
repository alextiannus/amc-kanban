import { prisma } from '@/lib/prisma'

export const TOPIC_FEED_SELECT = {
  id: true,
  brandId: true,
  title: true,
  markdown: true,
  summary: true,
  tags: true,
  sourceUrl: true,
  status: true,
  createdById: true,
  createdByType: true,
  createdAt: true,
  updatedAt: true,
} as const

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function normalizeOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export async function listTopicFeeds(input: { brandId: string; q?: string; tag?: string; status?: string; limit?: number }) {
  const q = input.q?.trim()
  const tag = input.tag?.trim().replace(/^#/, '')
  const status = input.status?.trim() || 'active'
  const take = Math.min(Math.max(input.limit || 50, 1), 100)

  return prisma.topicFeed.findMany({
    where: {
      brandId: input.brandId,
      ...(status === 'all' ? {} : { status }),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(q ? {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { summary: { contains: q, mode: 'insensitive' } },
          { markdown: { contains: q, mode: 'insensitive' } },
          { tags: { has: q } },
        ],
      } : {}),
    },
    select: TOPIC_FEED_SELECT,
    orderBy: { updatedAt: 'desc' },
    take,
  })
}

export async function getTopicFeed(brandId: string, topicId: string) {
  return prisma.topicFeed.findFirst({
    where: { id: topicId, brandId },
    select: TOPIC_FEED_SELECT,
  })
}

export async function createTopicFeed(input: {
  brandId: string
  title: unknown
  markdown: unknown
  summary?: unknown
  tags?: unknown
  sourceUrl?: unknown
  createdById?: string | null
  createdByType?: string
}) {
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  const markdown = typeof input.markdown === 'string' ? input.markdown.trim() : ''
  if (!title) return { ok: false as const, status: 400, error: 'title is required' }
  if (!markdown) return { ok: false as const, status: 400, error: 'markdown is required' }

  const topic = await prisma.topicFeed.create({
    data: {
      brandId: input.brandId,
      title,
      markdown,
      summary: normalizeOptionalString(input.summary),
      tags: normalizeStringArray(input.tags).map((tag) => tag.replace(/^#/, '')),
      sourceUrl: normalizeOptionalString(input.sourceUrl),
      createdById: input.createdById || null,
      createdByType: input.createdByType || 'SYSTEM',
    },
    select: TOPIC_FEED_SELECT,
  })

  return { ok: true as const, topic }
}

export async function updateTopicFeed(input: {
  brandId: string
  topicId: string
  title?: unknown
  markdown?: unknown
  summary?: unknown
  tags?: unknown
  sourceUrl?: unknown
  status?: unknown
}) {
  const existing = await prisma.topicFeed.findFirst({ where: { id: input.topicId, brandId: input.brandId }, select: { id: true } })
  if (!existing) return { ok: false as const, status: 404, error: 'Not found' }

  const topic = await prisma.topicFeed.update({
    where: { id: input.topicId },
    data: {
      title: typeof input.title === 'string' ? input.title.trim() : undefined,
      markdown: typeof input.markdown === 'string' ? input.markdown.trim() : undefined,
      summary: input.summary === undefined ? undefined : normalizeOptionalString(input.summary),
      tags: Array.isArray(input.tags) ? normalizeStringArray(input.tags).map((tag) => tag.replace(/^#/, '')) : undefined,
      sourceUrl: input.sourceUrl === undefined ? undefined : normalizeOptionalString(input.sourceUrl),
      status: typeof input.status === 'string' && input.status.trim() ? input.status.trim() : undefined,
    },
    select: TOPIC_FEED_SELECT,
  })

  return { ok: true as const, topic }
}

export async function archiveTopicFeed(brandId: string, topicId: string) {
  return updateTopicFeed({ brandId, topicId, status: 'archived' })
}
