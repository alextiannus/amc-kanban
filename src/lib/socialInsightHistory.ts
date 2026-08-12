import 'server-only'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { detectContentType } from '@/app/api/brands/[id]/social-insight/socialInsightUtils'
import { stableSocialSourceKey } from '@/lib/socialInsightIdentity'

type UnknownRecord = Record<string, unknown>

export type SocialHistoryPostInput = {
  source: string
  externalId?: string | null
  platform?: string | null
  handle?: string | null
  caption?: string | null
  postUrl?: string | null
  publishedAt?: string | Date | null
  contentType?: string | null
  status?: string | null
  mediaUrls?: string[] | null
  likes?: unknown
  comments?: unknown
  shares?: unknown
  impressions?: unknown
  reach?: unknown
  raw?: unknown
}

export type SocialHistoryReviewInput = {
  source: string
  externalId?: string | null
  platform?: string | null
  reviewerName?: string | null
  rating?: unknown
  text?: string | null
  replyText?: string | null
  reviewUrl?: string | null
  publishedAt?: string | Date | null
  raw?: unknown
}

export type SocialHistoryAccountInput = {
  platform?: string | null
  handle?: string | null
  followerCount?: unknown
  followingCount?: unknown
  postCount?: unknown
  ratingScore?: unknown
  raw?: unknown
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function nonNegativeInt(value: unknown): number {
  return Math.max(0, Math.round(finiteNumber(value) ?? 0))
}

function nullableInt(value: unknown): number | null {
  const parsed = finiteNumber(value)
  return parsed === null ? null : Math.max(0, Math.round(parsed))
}

function validDate(value: unknown, fallback?: Date): Date | null {
  const date = value instanceof Date ? value : typeof value === 'string' || typeof value === 'number' ? new Date(value) : null
  if (date && !Number.isNaN(date.getTime())) return date
  return fallback ?? null
}

function dateOnlyUtc(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
}

function jsonValue(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined || value === null) return undefined
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function mapWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      await worker(items[index])
    }
  }))
}

export async function persistSocialPosts(
  brandId: string,
  inputs: SocialHistoryPostInput[],
  capturedAt = new Date(),
): Promise<number> {
  let persisted = 0
  await mapWithConcurrency(inputs, 6, async (input) => {
    const publishedAt = validDate(input.publishedAt, capturedAt)
    if (!publishedAt) return
    const source = String(input.source || 'unknown').toLowerCase()
    const platform = String(input.platform || 'unknown').toLowerCase()
    const caption = String(input.caption ?? '')
    const mediaUrls = Array.isArray(input.mediaUrls) ? input.mediaUrls.filter((url): url is string => typeof url === 'string') : []
    const sourceKey = stableSocialSourceKey({
      externalId: input.externalId,
      postUrl: input.postUrl,
      platform,
      handle: input.handle,
      publishedAt,
      text: caption,
    })
    const post = await prisma.socialInsightPost.upsert({
      where: { brandId_source_sourceKey: { brandId, source, sourceKey } },
      create: {
        brandId,
        source,
        sourceKey,
        externalId: input.externalId ? String(input.externalId) : null,
        platform,
        handle: input.handle ? String(input.handle) : null,
        caption,
        postUrl: input.postUrl || null,
        contentType: input.contentType || detectContentType(caption, mediaUrls, []),
        status: input.status || 'published',
        publishedAt,
        mediaUrls,
        raw: jsonValue(input.raw),
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
      },
      update: {
        externalId: input.externalId ? String(input.externalId) : undefined,
        platform,
        handle: input.handle ? String(input.handle) : undefined,
        caption,
        postUrl: input.postUrl || undefined,
        contentType: input.contentType || detectContentType(caption, mediaUrls, []),
        status: input.status || 'published',
        publishedAt,
        mediaUrls,
        raw: jsonValue(input.raw),
        lastSeenAt: capturedAt,
      },
      select: { id: true },
    })
    const snapshotDate = dateOnlyUtc(capturedAt)
    await prisma.socialInsightPostMetric.upsert({
      where: { postId_snapshotDate: { postId: post.id, snapshotDate } },
      create: {
        postId: post.id,
        snapshotDate,
        capturedAt,
        likes: nonNegativeInt(input.likes),
        comments: nonNegativeInt(input.comments),
        shares: nonNegativeInt(input.shares),
        impressions: nonNegativeInt(input.impressions),
        reach: nonNegativeInt(input.reach),
      },
      update: {
        capturedAt,
        likes: nonNegativeInt(input.likes),
        comments: nonNegativeInt(input.comments),
        shares: nonNegativeInt(input.shares),
        impressions: nonNegativeInt(input.impressions),
        reach: nonNegativeInt(input.reach),
      },
    })
    persisted++
  })
  return persisted
}

export async function persistSocialReviews(
  brandId: string,
  inputs: SocialHistoryReviewInput[],
  capturedAt = new Date(),
): Promise<number> {
  let persisted = 0
  await mapWithConcurrency(inputs, 6, async (input) => {
    const rating = finiteNumber(input.rating)
    const publishedAt = validDate(input.publishedAt, capturedAt)
    if (rating === null || rating < 1 || rating > 5 || !publishedAt) return
    const source = String(input.source || 'unknown').toLowerCase()
    const platform = String(input.platform || 'google').toLowerCase()
    const text = String(input.text ?? '')
    const sourceKey = stableSocialSourceKey({
      externalId: input.externalId,
      postUrl: input.reviewUrl,
      platform,
      handle: input.reviewerName,
      publishedAt,
      text,
    })
    await prisma.socialInsightReview.upsert({
      where: { brandId_source_sourceKey: { brandId, source, sourceKey } },
      create: {
        brandId,
        source,
        sourceKey,
        externalId: input.externalId ? String(input.externalId) : null,
        platform,
        reviewerName: input.reviewerName || null,
        rating,
        text,
        replyText: input.replyText || null,
        reviewUrl: input.reviewUrl || null,
        publishedAt,
        raw: jsonValue(input.raw),
        firstSeenAt: capturedAt,
        lastSeenAt: capturedAt,
      },
      update: {
        reviewerName: input.reviewerName || undefined,
        rating,
        text,
        replyText: input.replyText ?? undefined,
        reviewUrl: input.reviewUrl ?? undefined,
        publishedAt,
        raw: jsonValue(input.raw),
        lastSeenAt: capturedAt,
      },
    })
    persisted++
  })
  return persisted
}

export async function persistSocialAccountMetrics(
  brandId: string,
  inputs: SocialHistoryAccountInput[],
  capturedAt = new Date(),
): Promise<number> {
  const snapshotDate = dateOnlyUtc(capturedAt)
  let persisted = 0
  await mapWithConcurrency(inputs, 6, async (input) => {
    const platform = String(input.platform ?? '').trim().toLowerCase()
    const handle = String(input.handle ?? '').trim()
    if (!platform || !handle) return
    await prisma.socialInsightAccountMetric.upsert({
      where: { brandId_platform_handle_snapshotDate: { brandId, platform, handle, snapshotDate } },
      create: {
        brandId,
        platform,
        handle,
        snapshotDate,
        capturedAt,
        followerCount: nullableInt(input.followerCount),
        followingCount: nullableInt(input.followingCount),
        postCount: nullableInt(input.postCount),
        ratingScore: finiteNumber(input.ratingScore),
        raw: jsonValue(input.raw),
      },
      update: {
        capturedAt,
        followerCount: nullableInt(input.followerCount),
        followingCount: nullableInt(input.followingCount),
        postCount: nullableInt(input.postCount),
        ratingScore: finiteNumber(input.ratingScore),
        raw: jsonValue(input.raw),
      },
    })
    persisted++
  })
  return persisted
}

export function postfastHistoryInputs(posts: UnknownRecord[]): SocialHistoryPostInput[] {
  return posts.map((post) => {
    const metric = post.latestMetric && typeof post.latestMetric === 'object' ? post.latestMetric as UnknownRecord : {}
    return {
      source: 'postfast',
      externalId: post.id ? String(post.id) : null,
      platform: post.platform ? String(post.platform) : post.platformId ? String(post.platformId) : 'unknown',
      handle: post.handle ? String(post.handle) : null,
      caption: post.content ? String(post.content) : post.caption ? String(post.caption) : '',
      postUrl: post.postUrl ? String(post.postUrl) : null,
      publishedAt: post.publishedAt as string | undefined,
      likes: metric.likes ?? (post.engagementStats as UnknownRecord | undefined)?.likes,
      comments: metric.comments ?? (post.engagementStats as UnknownRecord | undefined)?.comments,
      shares: metric.shares ?? (post.engagementStats as UnknownRecord | undefined)?.shares,
      impressions: metric.impressions ?? (post.engagementStats as UnknownRecord | undefined)?.impressions,
      reach: metric.reach ?? (post.engagementStats as UnknownRecord | undefined)?.reach,
      raw: post,
    }
  })
}

export function apifyPostHistoryInputs(posts: UnknownRecord[]): SocialHistoryPostInput[] {
  return posts.map((post) => ({
    source: String(post.source ?? 'apify'),
    externalId: post.postId ? String(post.postId) : post.id ? String(post.id) : null,
    platform: post.platform ? String(post.platform) : post.source ? String(post.source) : 'unknown',
    handle: post.handle ? String(post.handle) : post.ownerUsername ? String(post.ownerUsername) : null,
    caption: post.caption ? String(post.caption) : post.text ? String(post.text) : '',
    postUrl: post.url ? String(post.url) : null,
    publishedAt: post.publishedAt as string | undefined,
    mediaUrls: post.imageUrl ? [String(post.imageUrl)] : [],
    likes: post.likes,
    comments: post.comments,
    shares: post.shares,
    impressions: post.views,
    reach: post.views,
    raw: post,
  }))
}

export function reviewHistoryInputs(reviews: UnknownRecord[], source = 'apify'): SocialHistoryReviewInput[] {
  return reviews.map((review) => ({
    source,
    externalId: review.reviewId ? String(review.reviewId) : review.id ? String(review.id) : null,
    platform: review.platform ? String(review.platform) : 'google_maps',
    reviewerName: review.reviewerName ? String(review.reviewerName) : review.name ? String(review.name) : null,
    rating: review.rating,
    text: review.text ? String(review.text) : review.comment ? String(review.comment) : '',
    replyText: review.replyText ? String(review.replyText) : null,
    reviewUrl: review.url ? String(review.url) : null,
    publishedAt: (review.publishedAt ?? review.createTime) as string | undefined,
    raw: review,
  }))
}

export async function persistInternalPublishedPosts(brandId: string, capturedAt = new Date()): Promise<number> {
  const drafts = await prisma.contentDraft.findMany({
    where: { brandId, status: 'published', platformPostId: { not: null } },
    include: { account: { select: { platformId: true, handle: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return persistSocialPosts(brandId, drafts.map((draft: any) => ({
    source: 'internal',
    externalId: draft.platformPostId,
    platform: draft.account?.platformId ?? 'unknown',
    handle: draft.account?.handle ?? null,
    caption: draft.caption,
    postUrl: draft.postUrl ?? draft.platformPostId,
    publishedAt: draft.scheduledAt ?? draft.createdAt,
    contentType: detectContentType(draft.caption, draft.mediaUrls, draft.hashtags),
    mediaUrls: draft.mediaUrls,
    raw: { draftId: draft.id },
  })), capturedAt)
}

export async function loadPersistedPosts(brandId: string, from: Date, to: Date, platform = 'all') {
  const rows = await prisma.socialInsightPost.findMany({
    where: {
      brandId,
      publishedAt: { gte: from, lte: to },
      ...(platform === 'all' ? {} : { platform: { equals: platform, mode: 'insensitive' as const } }),
    },
    include: {
      metrics: {
        where: { capturedAt: { lte: to } },
        orderBy: [{ snapshotDate: 'desc' }, { capturedAt: 'desc' }],
        take: 1,
      },
    },
    orderBy: { publishedAt: 'desc' },
  })
  return rows.map((row: any) => {
    const metric = row.metrics[0]
    const likes = metric?.likes ?? 0
    const comments = metric?.comments ?? 0
    const shares = metric?.shares ?? 0
    const impressions = metric?.impressions ?? 0
    const reach = metric?.reach ?? 0
    const interactions = likes + comments + shares
    return {
      id: `history_${row.id}`,
      source: row.source,
      platform: row.platform,
      handle: row.handle ?? '',
      caption: row.caption,
      postUrl: row.postUrl,
      publishedAt: row.publishedAt.toISOString(),
      contentType: row.contentType ?? detectContentType(row.caption, row.mediaUrls, []),
      status: row.status,
      hashtags: [] as string[],
      mediaUrls: row.mediaUrls,
      scheduledAt: null,
      likes,
      comments,
      shares,
      impressions,
      reach,
      engRate: impressions > 0 ? Number(((interactions / impressions) * 100).toFixed(2)) : 0,
    }
  })
}

export async function loadPersistedReviews(brandId: string, from: Date, to: Date) {
  return prisma.socialInsightReview.findMany({
    where: { brandId, publishedAt: { gte: from, lte: to } },
    orderBy: { publishedAt: 'desc' },
    take: 500,
  })
}

export async function loadAccountMetricHistory(brandId: string, from: Date, to: Date) {
  const rows = await prisma.socialInsightAccountMetric.findMany({
    where: { brandId, capturedAt: { lte: to } },
    orderBy: [{ platform: 'asc' }, { handle: 'asc' }, { capturedAt: 'desc' }],
  })
  const atEnd = new Map<string, (typeof rows)[number]>()
  const beforeStart = new Map<string, (typeof rows)[number]>()
  for (const row of rows) {
    const key = `${row.platform}:${row.handle.toLowerCase()}`
    if (!atEnd.has(key)) atEnd.set(key, row)
    if (row.capturedAt < from && !beforeStart.has(key)) beforeStart.set(key, row)
  }
  return { atEnd, beforeStart }
}

export async function socialHistoryAvailability(brandId: string) {
  const [posts, reviews, metrics] = await Promise.all([
    prisma.socialInsightPost.aggregate({ where: { brandId }, _min: { publishedAt: true }, _max: { publishedAt: true } }),
    prisma.socialInsightReview.aggregate({ where: { brandId }, _min: { publishedAt: true }, _max: { publishedAt: true } }),
    prisma.socialInsightAccountMetric.aggregate({ where: { brandId }, _min: { capturedAt: true }, _max: { capturedAt: true } }),
  ])
  const starts = [posts._min.publishedAt, reviews._min.publishedAt, metrics._min.capturedAt].filter((v): v is Date => !!v)
  const ends = [posts._max.publishedAt, reviews._max.publishedAt, metrics._max.capturedAt].filter((v): v is Date => !!v)
  return {
    availableFrom: starts.length ? new Date(Math.min(...starts.map((date) => date.getTime()))) : null,
    availableTo: ends.length ? new Date(Math.max(...ends.map((date) => date.getTime()))) : null,
  }
}
