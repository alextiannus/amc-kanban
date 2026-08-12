import 'dotenv/config'
import { createHash } from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const apply = process.argv.includes('--apply')
const brandArg = process.argv.find((value) => value.startsWith('--brand='))
const brandId = brandArg?.slice('--brand='.length) || null
const limitArg = process.argv.find((value) => value.startsWith('--limit='))
const limit = Math.min(500, Math.max(1, Number(limitArg?.split('=')[1]) || 100))

if (!process.env.DATABASE_URL) {
  console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', skipped: true, reason: 'DATABASE_URL is not configured' }, null, 2))
  process.exitCode = apply ? 1 : 0
} else {
  const prisma = new PrismaClient()
  const asArray = (value) => Array.isArray(value) ? value : []
  const number = (value) => {
    const parsed = Number(String(value ?? '0').replace(/,/g, ''))
    return Number.isFinite(parsed) ? parsed : 0
  }
  const integer = (value) => Math.max(0, Math.round(number(value)))
  const date = (value, fallback) => {
    const parsed = value ? new Date(value) : fallback
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : fallback
  }
  const dateOnly = (value) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()))
  const normalizeUrl = (value) => {
    if (!value || !String(value).startsWith('http')) return ''
    try {
      const url = new URL(String(value))
      url.search = ''
      url.hash = ''
      return `${url.hostname.replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase()
    } catch {
      return String(value).toLowerCase().split('?')[0].replace(/\/+$/, '')
    }
  }
  const sourceKey = ({ externalId, url, platform, handle, publishedAt, text }) => {
    if (externalId) return `id:${String(externalId)}`
    const normalizedUrl = normalizeUrl(url)
    if (normalizedUrl) return `url:${normalizedUrl}`
    const fingerprint = [platform, handle, publishedAt?.toISOString().slice(0, 10), text]
      .map((value) => String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim())
      .join('|')
    return `sha256:${createHash('sha256').update(fingerprint).digest('hex')}`
  }

  const counters = { brands: 0, posts: 0, metrics: 0, reviews: 0, accounts: 0 }
  const persistPost = async (currentBrandId, input, capturedAt) => {
    const publishedAt = date(input.publishedAt, capturedAt)
    const source = String(input.source || 'unknown').toLowerCase()
    const platform = String(input.platform || 'unknown').toLowerCase()
    const key = sourceKey({ externalId: input.externalId, url: input.postUrl, platform, handle: input.handle, publishedAt, text: input.caption })
    counters.posts++
    counters.metrics++
    if (!apply) return
    const post = await prisma.socialInsightPost.upsert({
      where: { brandId_source_sourceKey: { brandId: currentBrandId, source, sourceKey: key } },
      create: {
        brandId: currentBrandId, source, sourceKey: key, externalId: input.externalId ? String(input.externalId) : null,
        platform, handle: input.handle || null, caption: String(input.caption || ''), postUrl: input.postUrl || null,
        contentType: input.contentType || null, status: 'published', publishedAt, mediaUrls: asArray(input.mediaUrls),
        raw: input.raw || undefined, firstSeenAt: capturedAt, lastSeenAt: capturedAt,
      },
      update: {
        platform, handle: input.handle || undefined, caption: String(input.caption || ''), postUrl: input.postUrl || undefined,
        publishedAt, mediaUrls: asArray(input.mediaUrls), raw: input.raw || undefined, lastSeenAt: capturedAt,
      },
      select: { id: true },
    })
    const snapshotDate = dateOnly(capturedAt)
    await prisma.socialInsightPostMetric.upsert({
      where: { postId_snapshotDate: { postId: post.id, snapshotDate } },
      create: {
        postId: post.id, snapshotDate, capturedAt, likes: integer(input.likes), comments: integer(input.comments),
        shares: integer(input.shares), impressions: integer(input.impressions), reach: integer(input.reach),
      },
      update: {
        capturedAt, likes: integer(input.likes), comments: integer(input.comments), shares: integer(input.shares),
        impressions: integer(input.impressions), reach: integer(input.reach),
      },
    })
  }
  const persistReview = async (currentBrandId, input, capturedAt) => {
    const rating = number(input.rating)
    if (rating < 1 || rating > 5) return
    const publishedAt = date(input.publishedAt, capturedAt)
    const source = String(input.source || 'unknown').toLowerCase()
    const platform = String(input.platform || 'google').toLowerCase()
    const key = sourceKey({ externalId: input.externalId, url: input.reviewUrl, platform, handle: input.reviewerName, publishedAt, text: input.text })
    counters.reviews++
    if (!apply) return
    await prisma.socialInsightReview.upsert({
      where: { brandId_source_sourceKey: { brandId: currentBrandId, source, sourceKey: key } },
      create: {
        brandId: currentBrandId, source, sourceKey: key, externalId: input.externalId ? String(input.externalId) : null,
        platform, reviewerName: input.reviewerName || null, rating, text: String(input.text || ''), replyText: input.replyText || null,
        reviewUrl: input.reviewUrl || null, publishedAt, raw: input.raw || undefined, firstSeenAt: capturedAt, lastSeenAt: capturedAt,
      },
      update: {
        reviewerName: input.reviewerName || undefined, rating, text: String(input.text || ''), replyText: input.replyText || undefined,
        reviewUrl: input.reviewUrl || undefined, publishedAt, raw: input.raw || undefined, lastSeenAt: capturedAt,
      },
    })
  }
  const persistAccount = async (currentBrandId, input, capturedAt) => {
    const platform = String(input.platform || '').toLowerCase()
    const handle = String(input.handle || '')
    if (!platform || !handle) return
    counters.accounts++
    if (!apply) return
    const snapshotDate = dateOnly(capturedAt)
    await prisma.socialInsightAccountMetric.upsert({
      where: { brandId_platform_handle_snapshotDate: { brandId: currentBrandId, platform, handle, snapshotDate } },
      create: {
        brandId: currentBrandId, platform, handle, snapshotDate, capturedAt,
        followerCount: input.followerCount == null ? null : integer(input.followerCount),
        followingCount: input.followingCount == null ? null : integer(input.followingCount),
        postCount: input.postCount == null ? null : integer(input.postCount),
        ratingScore: input.ratingScore == null ? null : number(input.ratingScore), raw: input.raw || undefined,
      },
      update: {
        capturedAt, followerCount: input.followerCount == null ? null : integer(input.followerCount),
        followingCount: input.followingCount == null ? null : integer(input.followingCount),
        postCount: input.postCount == null ? null : integer(input.postCount),
        ratingScore: input.ratingScore == null ? null : number(input.ratingScore), raw: input.raw || undefined,
      },
    })
  }
  const postfastInput = (post) => {
    const metric = post.latestMetric || post.engagementStats || {}
    return {
      source: 'postfast', externalId: post.id, platform: post.platform || post.platformId, handle: post.handle,
      caption: post.content || post.caption, postUrl: post.postUrl || post.url, publishedAt: post.publishedAt,
      likes: metric.likes, comments: metric.comments, shares: metric.shares, impressions: metric.impressions, reach: metric.reach, raw: post,
    }
  }
  const apifyPostInput = (post) => ({
    source: post.source || 'apify', externalId: post.postId || post.id, platform: post.platform || post.source,
    handle: post.handle || post.ownerUsername, caption: post.caption || post.text, postUrl: post.url,
    publishedAt: post.publishedAt, mediaUrls: post.imageUrl ? [post.imageUrl] : [], likes: post.likes,
    comments: post.comments, shares: post.shares, impressions: post.views, reach: post.views, raw: post,
  })
  const reviewInput = (review, source = 'apify') => ({
    source, externalId: review.reviewId || review.id, platform: review.platform || 'google_maps',
    reviewerName: review.reviewerName || review.name, rating: review.rating, text: review.text || review.comment,
    replyText: review.replyText, reviewUrl: review.url, publishedAt: review.publishedAt || review.createTime, raw: review,
  })

  try {
    const brands = await prisma.brand.findMany({
      where: brandId ? { id: brandId } : {},
      select: {
        id: true,
        postfastSnapshot: true,
        postfastSyncedAt: true,
        accounts: { select: { platformId: true, handle: true, followerCount: true, ratingScore: true, snapshotAt: true } },
        contents: {
          where: { status: 'published', platformPostId: { not: null } },
          select: { id: true, platformPostId: true, caption: true, postUrl: true, scheduledAt: true, createdAt: true, mediaUrls: true, account: { select: { platformId: true, handle: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    })
    for (const brand of brands) {
      counters.brands++
      const snapshot = brand.postfastSnapshot && typeof brand.postfastSnapshot === 'object' ? brand.postfastSnapshot : {}
      const snapshotAt = date(snapshot.analyticsUpdatedAt, brand.postfastSyncedAt || new Date())
      for (const post of asArray(snapshot.analyticsPosts)) await persistPost(brand.id, postfastInput(post), snapshotAt)
      for (const account of brand.accounts) await persistAccount(brand.id, { platform: account.platformId, handle: account.handle, followerCount: account.followerCount, ratingScore: account.ratingScore, raw: { source: 'social_account' } }, account.snapshotAt || snapshotAt)
      for (const draft of brand.contents) await persistPost(brand.id, {
        source: 'internal', externalId: draft.platformPostId, platform: draft.account?.platformId, handle: draft.account?.handle,
        caption: draft.caption, postUrl: draft.postUrl || draft.platformPostId, publishedAt: draft.scheduledAt || draft.createdAt,
        mediaUrls: draft.mediaUrls, raw: { draftId: draft.id },
      }, new Date())

      const logs = await prisma.auditLog.findMany({ where: { resourceId: brand.id, resourceType: 'ApifySync' }, orderBy: { timestamp: 'asc' }, select: { timestamp: true, metadata: true } })
      for (const log of logs) {
        const metadata = log.metadata && typeof log.metadata === 'object' ? log.metadata : {}
        for (const key of ['instagramPosts', 'tiktokPosts', 'xiaohongshuPosts', 'facebookPosts']) {
          for (const post of asArray(metadata[key])) await persistPost(brand.id, apifyPostInput(post), log.timestamp)
        }
        for (const review of asArray(metadata.googleReviews)) await persistReview(brand.id, reviewInput(review), log.timestamp)
        for (const key of ['instagramProfiles', 'tiktokProfiles', 'facebookProfiles']) {
          for (const profile of asArray(metadata[key])) await persistAccount(brand.id, {
            platform: profile.platform, handle: profile.handle, followerCount: profile.followerCount,
            followingCount: profile.followingCount, postCount: profile.postCount, raw: profile,
          }, log.timestamp)
        }
      }

      const reviewItems = await prisma.actionItem.findMany({ where: { brandId: brand.id, type: { in: ['sentiment_alert', 'apify_review'] } }, select: { id: true, payload: true, description: true, createdAt: true } })
      for (const item of reviewItems) {
        const payload = item.payload && typeof item.payload === 'object' ? item.payload : {}
        await persistReview(brand.id, {
          source: payload.source || 'database', externalId: item.id, platform: payload.platform || 'google',
          reviewerName: payload.reviewerName, rating: payload.rating, text: payload.reviewText || item.description,
          replyText: payload.replyText, reviewUrl: payload.reviewUrl, publishedAt: payload.publishedAt || item.createdAt,
          raw: { actionItemId: item.id },
        }, item.createdAt)
      }
    }
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', ...counters }, null, 2))
  } finally {
    await prisma.$disconnect()
  }
}
