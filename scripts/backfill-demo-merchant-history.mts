import 'dotenv/config'

import { createHash } from 'node:crypto'
import { PrismaClient, type Prisma } from '@prisma/client'

const APPLY = process.argv.includes('--apply')
const RESET_DEMO = process.argv.includes('--reset-demo')
const TODAY = new Date(Date.UTC(2026, 7, 31))
const BACKFILL_START = new Date(Date.UTC(2026, 0, 4))
const BACKFILL_END = new Date(Date.UTC(2026, 5, 30))
const BACKFILL_END_EXCLUSIVE = addDays(BACKFILL_END, 1)
const NINETY_START = new Date(Date.UTC(2026, 5, 2))
const SOURCE = 'historical_demo_backfill'
const VERSION = '2026-08-31-v2'

type Platform = 'tiktok' | 'instagram' | 'xiaohongshu' | 'facebook' | 'google'

type MerchantConfig = {
  key: string
  displayName: string
  matchers: string[]
  primary: Platform
  target90: { impressions: number; posts: number; peak: number }
  postMultiplierBefore90: number
  seasonalBias: number[]
  weekdayBias: number[]
  platformWeights: Partial<Record<Platform, number>>
  themes: string[]
  hooks: string[]
  handleBase: string
  baseFollowers: Partial<Record<Platform, number>>
  rating?: number
}

type DemoPost = {
  id: string
  date: Date
  platform: Platform
  caption: string
  hashtags: string[]
  impressions: number
  reach: number
  likes: number
  comments: number
  shares: number
  saves: number
  contentType: string
}

const merchants: MerchantConfig[] = [
  {
    key: 'dongbeiren',
    displayName: '东北人餐厅',
    matchers: ['东北人餐厅', '东北人'],
    primary: 'tiktok',
    target90: { impressions: 121581, posts: 52, peak: 3020 },
    postMultiplierBefore90: 0.76,
    seasonalBias: [0.82, 0.9, 1.05, 1.08, 1.16, 1.28, 1.2, 1.1, 1, 0.95, 1.02, 1.18],
    weekdayBias: [1.35, 0.78, 0.82, 0.9, 1.05, 1.25, 1.42],
    platformWeights: { tiktok: 0.56, instagram: 0.18, xiaohongshu: 0.16, facebook: 0.1 },
    themes: ['锅包肉', '酸菜白肉锅', '东北烧烤', '地三鲜', '晚餐聚会', '家庭套餐'],
    hooks: ['下班后来一桌热乎的', '这口酸香很东北', '周末聚餐不用想太久', '老客人常点这一份'],
    handleBase: 'dongbeiren',
    baseFollowers: { tiktok: 2800, instagram: 980, xiaohongshu: 720, facebook: 450 },
    rating: 4.5,
  },
  {
    key: 'ziwei-kaoyu',
    displayName: '成都滋味烤鱼',
    matchers: ['成都滋味烤鱼', '滋味烤鱼'],
    primary: 'tiktok',
    target90: { impressions: 156649, posts: 63, peak: 3781 },
    postMultiplierBefore90: 0.68,
    seasonalBias: [0.78, 0.86, 0.96, 1.02, 1.12, 1.35, 1.26, 1.22, 1.08, 1, 1.05, 1.18],
    weekdayBias: [1.1, 0.72, 0.86, 1, 1.18, 1.52, 1.45],
    platformWeights: { tiktok: 0.62, instagram: 0.14, xiaohongshu: 0.14, facebook: 0.1 },
    themes: ['麻辣烤鱼', '蒜香烤鱼', '夜宵局', '双人套餐', '成都味道', '加菜攻略'],
    hooks: ['鱼皮烤到微焦才香', '辣度可以慢慢加', '晚餐高峰前先订位', '这一锅适合两三个人分'],
    handleBase: 'ziwei_kaoyu',
    baseFollowers: { tiktok: 3600, instagram: 1250, xiaohongshu: 880, facebook: 520 },
    rating: 4.6,
  },
  {
    key: 'poxiaoman',
    displayName: '坡晓馒',
    matchers: ['坡晓馒'],
    primary: 'xiaohongshu',
    target90: { impressions: 80856, posts: 51, peak: 1444 },
    postMultiplierBefore90: 0.82,
    seasonalBias: [0.9, 0.94, 1.02, 1.08, 1.18, 1.12, 1.05, 1.14, 1.25, 1.1, 1.02, 0.96],
    weekdayBias: [1.18, 1.02, 0.96, 0.95, 1.06, 1.22, 1.28],
    platformWeights: { xiaohongshu: 0.54, instagram: 0.24, tiktok: 0.12, facebook: 0.1 },
    themes: ['手作馒头', '早餐组合', '黑芝麻馒头', '红糖馒头', '下午茶', '家庭装'],
    hooks: ['早上蒸一下就很香', '不靠重口味也能记住', '今天这一笼很适合带回家', '软糯口感是重点'],
    handleBase: 'poxiaoman',
    baseFollowers: { xiaohongshu: 1600, instagram: 740, tiktok: 520, facebook: 360 },
    rating: 4.7,
  },
  {
    key: 'yolates-28',
    displayName: '28℃ YOLATES 普拉提馆',
    matchers: ['28℃ YOLATES 普拉提馆', '28℃ YOLATES', 'YOLATES'],
    primary: 'instagram',
    target90: { impressions: 186913, posts: 65, peak: 3407 },
    postMultiplierBefore90: 0.72,
    seasonalBias: [0.86, 0.92, 1.02, 1.1, 1.22, 1.24, 1.18, 1.3, 1.16, 1.08, 1.02, 0.95],
    weekdayBias: [1.05, 1.16, 1.28, 1.22, 1.1, 0.92, 1.18],
    platformWeights: { instagram: 0.58, xiaohongshu: 0.2, tiktok: 0.16, facebook: 0.06 },
    themes: ['普拉提核心训练', '体态改善', '小班课程', '课后拉伸', '新手体验', '会员打卡'],
    hooks: ['今天把肩颈打开一点', '小班课更容易被看见动作', '不是硬撑，是慢慢找回控制', '下班后的四十五分钟留给自己'],
    handleBase: '28yolates',
    baseFollowers: { instagram: 4200, xiaohongshu: 1350, tiktok: 980, facebook: 410 },
    rating: 4.8,
  },
]

const prisma = new PrismaClient()

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function dateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function inNinetyDayWindow(date: Date) {
  return date >= NINETY_START && date < BACKFILL_END_EXCLUSIVE
}

function seededNumber(seed: string) {
  const digest = createHash('sha256').update(seed).digest()
  return digest.readUInt32BE(0) / 0xffffffff
}

function seededInt(seed: string, min: number, max: number) {
  return Math.floor(seededNumber(seed) * (max - min + 1)) + min
}

function weightedPick<T extends string>(weights: Partial<Record<T, number>>, seed: string): T {
  const entries = Object.entries(weights) as Array<[T, number]>
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0)
  let cursor = seededNumber(seed) * total
  for (const [value, weight] of entries) {
    cursor -= weight
    if (cursor <= 0) return value
  }
  return entries[0][0]
}

function dayScore(config: MerchantConfig, date: Date) {
  const month = date.getUTCMonth()
  const weekday = date.getUTCDay()
  const base = config.seasonalBias[month] * config.weekdayBias[weekday]
  const pulse = 0.74 + seededNumber(`${config.key}:${dateKey(date)}:pulse`) * 0.72
  const campaign = seededNumber(`${config.key}:${dateKey(date)}:campaign`) > 0.93 ? 1.65 : 1
  return base * pulse * campaign
}

function allocatePostDates(config: MerchantConfig, start: Date, end: Date, count: number) {
  const days = Array.from({ length: daysBetween(start, end) }, (_, index) => addDays(start, index))
  const scored = days.map((date) => ({ date, score: dayScore(config, date) }))
    .sort((a, b) => b.score - a.score)

  const result: Date[] = []
  for (const item of scored) {
    if (result.length >= count) break
    result.push(item.date)
  }

  if (result.length >= count) {
    return result.sort((a, b) => a.getTime() - b.getTime())
  }

  for (const item of scored) {
    if (result.length >= count) break
    if (item.score <= 1.2) continue
    result.push(item.date)
  }

  return result.sort((a, b) => a.getTime() - b.getTime())
}

function captionFor(config: MerchantConfig, platform: Platform, date: Date, index: number) {
  const theme = config.themes[seededInt(`${config.key}:${dateKey(date)}:${index}:theme`, 0, config.themes.length - 1)]
  const hook = config.hooks[seededInt(`${config.key}:${dateKey(date)}:${index}:hook`, 0, config.hooks.length - 1)]
  const platformLine = platform === 'xiaohongshu'
    ? '适合收藏的一条到店笔记。'
    : platform === 'instagram'
      ? 'A small moment from today, saved for the next visit.'
      : platform === 'tiktok'
        ? '短视频里看得到火候和现场感。'
        : '给附近老客的新鲜提醒。'
  return `${hook} ${theme}：${platformLine}`
}

function generatePosts(config: MerchantConfig) {
  const olderEnd = addDays(NINETY_START, -1)
  const olderTarget = Math.round(config.target90.posts * config.postMultiplierBefore90 * (daysBetween(BACKFILL_START, olderEnd) / 90))
  const dates = [
    ...allocatePostDates(config, BACKFILL_START, olderEnd, olderTarget),
    ...allocatePostDates(config, NINETY_START, BACKFILL_END, config.target90.posts),
  ]

  const posts: DemoPost[] = dates.map((date, index) => {
    const platform = weightedPick<Platform>(config.platformWeights, `${config.key}:${dateKey(date)}:${index}:platform`)
    const hour = platform === 'tiktok'
      ? seededInt(`${config.key}:${index}:hour`, 17, 22)
      : platform === 'instagram'
        ? seededInt(`${config.key}:${index}:hour`, 8, 20)
        : seededInt(`${config.key}:${index}:hour`, 7, 18)
    const publishedAt = new Date(Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      hour,
      seededInt(`${config.key}:${index}:minute`, 0, 55),
    ))
    const isVideo = platform === 'tiktok' || seededNumber(`${config.key}:${index}:video`) > 0.58
    return {
      id: `${SOURCE}-${VERSION}-${config.key}-${dateKey(date)}-${index}`,
      date: publishedAt,
      platform,
      caption: captionFor(config, platform, date, index),
      hashtags: [config.displayName.replace(/\s+/g, ''), config.themes[index % config.themes.length].replace(/\s+/g, '')],
      impressions: Math.max(160, Math.round(dayScore(config, date) * seededInt(`${config.key}:${index}:impressions`, 760, 2100))),
      reach: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      saves: 0,
      contentType: isVideo ? 'video' : 'image',
    }
  })

  calibrateNinetyDays(config, posts)
  for (const post of posts) {
    const engagementBase = post.platform === config.primary ? 0.036 : post.platform === 'xiaohongshu' ? 0.031 : 0.025
    const engagementRate = engagementBase * (0.62 + seededNumber(`${post.id}:eng`) * 1.18)
    const engagement = Math.max(2, Math.round(post.impressions * engagementRate))
    post.likes = Math.max(1, Math.round(engagement * (0.68 + seededNumber(`${post.id}:likes`) * 0.16)))
    post.comments = Math.max(0, Math.round(engagement * (0.06 + seededNumber(`${post.id}:comments`) * 0.08)))
    post.shares = Math.max(0, engagement - post.likes - post.comments)
    post.saves = post.platform === 'xiaohongshu' || post.platform === 'instagram'
      ? Math.max(0, Math.round(engagement * (0.08 + seededNumber(`${post.id}:saves`) * 0.12)))
      : Math.max(0, Math.round(engagement * 0.04))
    post.reach = Math.max(post.impressions, Math.round(post.impressions * (0.72 + seededNumber(`${post.id}:reach`) * 0.18)))
  }
  return posts
}

function calibrateNinetyDays(config: MerchantConfig, posts: DemoPost[]) {
  const ninetyPosts = posts.filter((post) => inNinetyDayWindow(post.date))
  const grouped = new Map<string, DemoPost[]>()
  for (const post of ninetyPosts) {
    const key = dateKey(post.date)
    grouped.set(key, [...(grouped.get(key) ?? []), post])
  }
  const peakDay = Array.from(grouped.entries()).sort((a, b) => {
    const bScore = b[1].reduce((sum, post) => sum + dayScore(config, post.date), 0)
    const aScore = a[1].reduce((sum, post) => sum + dayScore(config, post.date), 0)
    return bScore - aScore
  })[0]
  if (peakDay) {
    const [key, items] = peakDay
    const last = items[items.length - 1]
    let remainingPeak = config.target90.peak
    for (const post of items) {
      if (post === last) continue
      post.impressions = Math.max(220, Math.round(config.target90.peak * (0.22 + seededNumber(`${post.id}:peak-share`) * 0.16)))
      remainingPeak -= post.impressions
    }
    last.impressions = Math.max(180, remainingPeak)
    grouped.set(key, items)
  }

  const nonPeakPosts = ninetyPosts.filter((post) => dateKey(post.date) !== (peakDay?.[0] ?? ''))
  const currentNonPeak = nonPeakPosts.reduce((sum, post) => sum + post.impressions, 0)
  const targetNonPeak = config.target90.impressions - config.target90.peak
  const scale = currentNonPeak > 0 ? targetNonPeak / currentNonPeak : 1
  for (const post of nonPeakPosts) {
    post.impressions = Math.max(90, Math.round(post.impressions * scale))
  }

  const diff = config.target90.impressions - ninetyPosts.reduce((sum, post) => sum + post.impressions, 0)
  const adjustable = nonPeakPosts.find((post) => post.impressions + diff > 0) ?? nonPeakPosts[0]
  if (adjustable) adjustable.impressions += diff
}

function accountHandle(config: MerchantConfig, platform: Platform) {
  return platform === 'google' ? config.displayName : `${config.handleBase}_${platform}`
}

function postUrl(platform: Platform, id: string) {
  const suffix = encodeURIComponent(id.replace(`${SOURCE}-${VERSION}-`, ''))
  if (platform === 'instagram') return `https://www.instagram.com/p/${suffix}/`
  if (platform === 'tiktok') return `https://www.tiktok.com/@amc_demo/video/${suffix}`
  if (platform === 'xiaohongshu') return `https://www.xiaohongshu.com/explore/${suffix}`
  if (platform === 'facebook') return `https://www.facebook.com/amc.demo/posts/${suffix}`
  return `https://maps.google.com/?cid=${suffix}`
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

async function findBrand(config: MerchantConfig) {
  const candidates = await prisma.brand.findMany({
    where: {
      OR: config.matchers.map((matcher) => ({ name: { contains: matcher, mode: 'insensitive' as const } })),
    },
    select: { id: true, name: true },
  })
  return candidates.sort((a, b) => {
    const aExact = config.matchers.includes(a.name)
    const bExact = config.matchers.includes(b.name)
    return Number(bExact) - Number(aExact)
  })[0] ?? null
}

async function resetDemoRows(brandId: string) {
  const posts = await prisma.socialInsightPost.findMany({
    where: { brandId, source: SOURCE },
    select: { id: true },
  })
  if (posts.length) {
    await prisma.socialInsightPostMetric.deleteMany({ where: { postId: { in: posts.map((post) => post.id) } } })
    await prisma.socialInsightPost.deleteMany({ where: { id: { in: posts.map((post) => post.id) } } })
  }
  await prisma.contentDraft.deleteMany({
    where: { brandId, agentNote: { contains: SOURCE } },
  })
  await prisma.conversionEvent.deleteMany({
    where: { brandId, source: SOURCE },
  })
  await prisma.socialInsightAccountMetric.deleteMany({
    where: { brandId, raw: { path: ['source'], equals: SOURCE } },
  })
}

async function upsertMerchant(config: MerchantConfig) {
  const brand = await findBrand(config)
  if (!brand) {
    return { key: config.key, matched: false }
  }

  const posts = generatePosts(config)
  const platforms = Array.from(new Set<Platform>([...posts.map((post) => post.platform), 'google']))
  const accountIds = new Map<Platform, string>()

  if (APPLY && RESET_DEMO) await resetDemoRows(brand.id)

  for (const platform of platforms) {
    const handle = accountHandle(config, platform)
    if (APPLY) {
      const account = await prisma.socialAccount.upsert({
        where: { brandId_platformId_handle: { brandId: brand.id, platformId: platform, handle } },
        create: {
          brandId: brand.id,
          platformId: platform,
          handle,
          displayName: platform === 'google' ? config.displayName : `${config.displayName} ${platform}`,
          autoPilot: true,
          followerCount: config.baseFollowers[platform] ?? 0,
          followerDelta: 0,
          ratingScore: platform === 'google' ? config.rating ?? null : null,
          snapshotAt: TODAY,
          profileUrl: postUrl(platform, `${config.key}-profile`),
        },
        update: {
          displayName: platform === 'google' ? config.displayName : `${config.displayName} ${platform}`,
          followerCount: config.baseFollowers[platform] ?? undefined,
          ratingScore: platform === 'google' ? config.rating ?? undefined : undefined,
          snapshotAt: TODAY,
        },
        select: { id: true },
      })
      accountIds.set(platform, account.id)
    }
  }

  for (const post of posts) {
    const accountId = accountIds.get(post.platform)
    const createdAt = addDays(post.date, -seededInt(`${post.id}:prep`, 2, 8))
    const externalId = post.id
    const sourceKey = `id:${externalId}`
    const url = postUrl(post.platform, externalId)
    const raw = json({
      source: SOURCE,
      synthetic: true,
      treatedAsProductionDemo: true,
      backfillVersion: VERSION,
      saves: post.saves,
      contentDraftId: post.id,
    })

    if (APPLY) {
      await prisma.contentDraft.upsert({
        where: { id: post.id },
        create: {
          id: post.id,
          brandId: brand.id,
          accountId,
          caption: post.caption,
          captionLang: post.platform === 'instagram' && config.key === 'yolates-28' ? 'en' : 'zh',
          mediaUrls: [],
          hashtags: post.hashtags,
          scheduledAt: post.date,
          status: 'published',
          agentNote: `${SOURCE}:${VERSION}`,
          platformPostId: externalId,
          postUrl: url,
          publishedAt: post.date,
          creativeHooks: config.hooks.join(' | '),
          topicKeywords: config.themes,
          createdAt,
          updatedAt: addDays(post.date, 1),
        },
        update: {
          accountId,
          caption: post.caption,
          hashtags: post.hashtags,
          scheduledAt: post.date,
          status: 'published',
          agentNote: `${SOURCE}:${VERSION}`,
          platformPostId: externalId,
          postUrl: url,
          publishedAt: post.date,
          creativeHooks: config.hooks.join(' | '),
          topicKeywords: config.themes,
          updatedAt: addDays(post.date, 1),
        },
      })

      const socialPost = await prisma.socialInsightPost.upsert({
        where: { brandId_source_sourceKey: { brandId: brand.id, source: SOURCE, sourceKey } },
        create: {
          brandId: brand.id,
          source: SOURCE,
          sourceKey,
          externalId,
          platform: post.platform,
          handle: accountHandle(config, post.platform),
          caption: post.caption,
          postUrl: url,
          contentType: post.contentType,
          status: 'published',
          publishedAt: post.date,
          mediaUrls: [],
          raw,
          firstSeenAt: addDays(post.date, 1),
          lastSeenAt: TODAY,
          createdAt,
          updatedAt: addDays(post.date, 1),
        },
        update: {
          platform: post.platform,
          handle: accountHandle(config, post.platform),
          caption: post.caption,
          postUrl: url,
          contentType: post.contentType,
          status: 'published',
          publishedAt: post.date,
          raw,
          lastSeenAt: TODAY,
        },
        select: { id: true },
      })

      const capturedAt = post.date
      await prisma.socialInsightPostMetric.upsert({
        where: { postId_snapshotDate: { postId: socialPost.id, snapshotDate: dateOnly(capturedAt) } },
        create: {
          postId: socialPost.id,
          snapshotDate: dateOnly(capturedAt),
          capturedAt,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          impressions: post.impressions,
          reach: post.reach,
          createdAt: capturedAt,
          updatedAt: capturedAt,
        },
        update: {
          capturedAt,
          likes: post.likes,
          comments: post.comments,
          shares: post.shares,
          impressions: post.impressions,
          reach: post.reach,
        },
      })

      const conversions = Math.min(4, Math.floor((post.likes + post.comments + post.shares) / 55))
      for (let i = 0; i < conversions; i++) {
        await prisma.conversionEvent.upsert({
          where: { id: `${post.id}-conversion-${i}` },
          create: {
            id: `${post.id}-conversion-${i}`,
            brandId: brand.id,
            type: i % 3 === 0 ? 'booking_click' : i % 3 === 1 ? 'nav_click' : 'coupon_redemption',
            source: SOURCE,
            referPostId: post.id,
            metadata: json({ source: SOURCE, platform: post.platform, postId: post.id }),
            occurredAt: addDays(post.date, seededInt(`${post.id}:conversion:${i}`, 0, 3)),
          },
          update: {},
        })
      }
    }
  }

  const monthEnds = Array.from({ length: 8 }, (_, index) => new Date(Date.UTC(2026, index + 1, 0, 12)))
    .filter((date) => date >= BACKFILL_START && date <= TODAY)
  for (const platform of platforms) {
    for (const [index, date] of monthEnds.entries()) {
      const base = config.baseFollowers[platform] ?? 0
      const growth = Math.round(base * (0.03 + index * 0.035) * (platform === config.primary ? 1.35 : 0.9))
      if (APPLY) {
        await prisma.socialInsightAccountMetric.upsert({
          where: {
            brandId_platform_handle_snapshotDate: {
              brandId: brand.id,
              platform,
              handle: accountHandle(config, platform),
              snapshotDate: dateOnly(date),
            },
          },
          create: {
            brandId: brand.id,
            platform,
            handle: accountHandle(config, platform),
            snapshotDate: dateOnly(date),
            capturedAt: date,
            followerCount: platform === 'google' ? null : base + growth,
            postCount: posts.filter((post) => post.platform === platform && post.date <= date).length,
            ratingScore: platform === 'google' ? config.rating ?? null : null,
            raw: json({ source: SOURCE, backfillVersion: VERSION }),
          },
          update: {
            capturedAt: date,
            followerCount: platform === 'google' ? null : base + growth,
            postCount: posts.filter((post) => post.platform === platform && post.date <= date).length,
            ratingScore: platform === 'google' ? config.rating ?? undefined : undefined,
            raw: json({ source: SOURCE, backfillVersion: VERSION }),
          },
        })
      }
    }
  }

  const ninetyPosts = posts.filter((post) => inNinetyDayWindow(post.date))
  const ninetyDaily = new Map<string, number>()
  for (const post of ninetyPosts) {
    const key = dateKey(post.date)
    ninetyDaily.set(key, (ninetyDaily.get(key) ?? 0) + post.impressions)
  }

  return {
    key: config.key,
    matched: true,
    brandId: brand.id,
    brandName: brand.name,
    posts: posts.length,
    insights: posts.length,
    metrics: posts.length,
    conversions: posts.reduce((sum, post) => sum + Math.min(4, Math.floor((post.likes + post.comments + post.shares) / 55)), 0),
    accounts: platforms.length,
    accountMetrics: platforms.length * monthEnds.length,
    ninetyDay: {
      impressions: ninetyPosts.reduce((sum, post) => sum + post.impressions, 0),
      posts: ninetyPosts.length,
      peak: Math.max(...Array.from(ninetyDaily.values())),
      primaryPlatform: config.primary,
    },
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not configured')
  }

  const results = []
  for (const config of merchants) {
    results.push(await upsertMerchant(config))
  }

  console.log(JSON.stringify({
    mode: APPLY ? 'apply' : 'dry-run',
    resetDemo: RESET_DEMO,
    source: SOURCE,
    version: VERSION,
    backfillWindow: { from: dateKey(BACKFILL_START), to: dateKey(BACKFILL_END) },
    ninetyDayWindow: { from: dateKey(NINETY_START), to: dateKey(BACKFILL_END) },
    results,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
