/**
 * scheduler.ts — Scheduler AI 智能排期巡检节点
 * ─────────────────────────────────────────────────────────────────────────────
 * 职责：
 *   1. 检查各品牌各平台发布频率是否达标（系统统一标准）
 *   2. 检查各品牌某平台是否超过 maxDaysSilent 天未发布（沉默告警）
 *   3. 检查过去30天内已排期/已发布草稿的主题重复情况
 *   4. 检查发布失败未处理的草稿
 *   5. 将结果写入 ActionItem 表
 *   6. 写入 SchedulerReport 表供历史查询
 */

import { prisma } from '@/lib/prisma'
import { getPublishingStandards, type PublishingStandards } from '@/lib/systemConfig'
import { extractTopicKeywords, detectTopicDuplicates } from '@/lib/topicExtractor'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SchedulerAlert {
  brandId: string
  brandName: string
  type:
    | 'scheduler_silence_alert'
    | 'scheduler_frequency_low'
    | 'scheduler_topic_duplicate'
    | 'scheduler_publish_failed'
  priority: 'high' | 'normal'
  title: string
  description: string
  payload?: Record<string, unknown>
}

export interface SchedulerReportSummary {
  totalBrands: number
  alertsGenerated: number
  silenceAlerts: number
  frequencyAlerts: number
  duplicateAlerts: number
  failedPostAlerts: number
  durationMs: number
  runAt: string
}

export interface SchedulerRunResult {
  summary: SchedulerReportSummary
  alerts: SchedulerAlert[]
  reportId: string
}

// ─── Helper: get all brands with their social accounts ───────────────────────

async function getBrandsWithAccounts() {
  return prisma.brand.findMany({
    select: {
      id: true,
      name: true,
      socialAccounts: {
        where: { connected: true },
        select: { id: true, platform: true, handle: true },
      },
    },
  })
}

// ─── 1. Frequency & Silence Check ─────────────────────────────────────────────

async function checkPublishingFrequency(
  brands: Awaited<ReturnType<typeof getBrandsWithAccounts>>,
  standards: PublishingStandards,
): Promise<SchedulerAlert[]> {
  const alerts: SchedulerAlert[] = []
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const silenceThreshold = new Date(now.getTime() - standards.maxDaysSilent * 24 * 60 * 60 * 1000)

  for (const brand of brands) {
    if (brand.socialAccounts.length === 0) continue

    // Collect last-published per platform for this brand
    const recentPublished = await prisma.contentDraft.findMany({
      where: {
        brandId: brand.id,
        status: 'published',
        publishedAt: { not: null },
      },
      select: {
        accountId: true,
        publishedAt: true,
        account: { select: { platform: true } },
      },
      orderBy: { publishedAt: 'desc' },
    })

    // Map: platform → last publishedAt
    const lastPublishedByPlatform = new Map<string, Date>()
    for (const draft of recentPublished) {
      const platform = draft.account?.platform?.toLowerCase() ?? ''
      if (platform && !lastPublishedByPlatform.has(platform) && draft.publishedAt) {
        lastPublishedByPlatform.set(platform, draft.publishedAt)
      }
    }

    // Map: platform → count published in last 7 days
    const publishedThisWeekByPlatform: Record<string, number> = {}
    for (const draft of recentPublished) {
      if (draft.publishedAt && draft.publishedAt >= weekAgo) {
        const platform = draft.account?.platform?.toLowerCase() ?? 'unknown'
        publishedThisWeekByPlatform[platform] = (publishedThisWeekByPlatform[platform] ?? 0) + 1
      }
    }

    for (const account of brand.socialAccounts) {
      const platform = account.platform.toLowerCase()
      const platformStandard = standards.platforms[platform]

      // Q1: 未绑定平台跳过（此处 account 来自已连接账号，platformStandard 未配置才跳过）
      if (!platformStandard) continue

      const lastPub = lastPublishedByPlatform.get(platform)

      // ── 高频平台：检查上次发布距今天数（maxDaysBetweenPosts）─────────────
      if (platformStandard.maxDaysBetweenPosts !== undefined) {
        const maxGap = platformStandard.maxDaysBetweenPosts
        const daysSince = lastPub
          ? Math.floor((now.getTime() - lastPub.getTime()) / (1000 * 60 * 60 * 24))
          : null
        const isOverdue = !lastPub || (daysSince !== null && daysSince > maxGap)

        if (isOverdue) {
          alerts.push({
            brandId: brand.id,
            brandName: brand.name,
            type: 'scheduler_silence_alert',
            priority: 'high',
            title: `${brand.name} ${account.platform} 已${daysSince ?? '从未'}${typeof daysSince === 'number' ? '天' : ''}未更新`,
            description: daysSince !== null
              ? `距上次在 ${account.platform} 发布已过去 ${daysSince} 天，超过间隔上限 ${maxGap} 天，建议立即安排新内容。`
              : `${brand.name} 从未在 ${account.platform} 发布过内容，请尽快安排首次发布。`,
            payload: { platform, accountId: account.id, daysSince, maxDaysBetweenPosts: maxGap },
          })
        }
      }

      // ── 低频平台：检查每周发布总量（minPerWeek）───────────────────────────
      if (platformStandard.minPerWeek !== undefined) {
        const target = platformStandard.minPerWeek
        const thisWeekCount = publishedThisWeekByPlatform[platform] ?? 0

        // Also check global silence (hasn't published at all recently)
        const isSilent = !lastPub || lastPub < silenceThreshold
        if (isSilent) {
          const daysSilent = lastPub
            ? Math.floor((now.getTime() - lastPub.getTime()) / (1000 * 60 * 60 * 24))
            : null
          alerts.push({
            brandId: brand.id,
            brandName: brand.name,
            type: 'scheduler_silence_alert',
            priority: 'high',
            title: `${brand.name} ${account.platform} 已${daysSilent ? `${daysSilent}天` : '从未'}未发布`,
            description: daysSilent
              ? `距离上次在 ${account.platform} 发布已过去 ${daysSilent} 天，超过告警阈值 ${standards.maxDaysSilent} 天。建议立即安排内容。`
              : `${brand.name} 从未在 ${account.platform} 发布过内容，请尽快安排首次发布。`,
            payload: { platform, accountId: account.id, daysSilent },
          })
        } else if (thisWeekCount < target) {
          alerts.push({
            brandId: brand.id,
            brandName: brand.name,
            type: 'scheduler_frequency_low',
            priority: 'normal',
            title: `${brand.name} ${account.platform} 本周发布量不足`,
            description: `本周在 ${account.platform} 仅发布了 ${thisWeekCount} 篇，目标为 ${target} 篇/周。`,
            payload: { platform, accountId: account.id, thisWeekCount, target },
          })
        }
      }
    }
  }

  return alerts
}

// ─── 2. Topic Duplicate Check (30-day window) ─────────────────────────────────
// Q4 行为：检测到重复的【已排期】草稿，直接改回 draft 状态 + 清除 scheduledAt，
//          生成 high-priority ActionItem 通知主理人处理。
// Q3 时机：仅在每日定时巡检（07:00 / 14:00）中执行，不在草稿生成时实时检查。

async function checkTopicDuplicates(
  brands: Awaited<ReturnType<typeof getBrandsWithAccounts>>,
  windowDays = 30,
): Promise<SchedulerAlert[]> {
  const alerts: SchedulerAlert[] = []
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000)

  for (const brand of brands) {
    // ── 历史参照集：过去30天内已发布/已审批内容 ──────────────────────────────
    const historicalDrafts = await prisma.contentDraft.findMany({
      where: {
        brandId: brand.id,
        status: { in: ['published', 'approved'] },
        OR: [
          { publishedAt: { gte: windowStart } },
          { scheduledAt: { gte: windowStart } },
        ],
      },
      select: {
        id: true,
        caption: true,
        topicKeywords: true,
        scheduledAt: true,
        publishedAt: true,
        status: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // ── 检查目标：所有【已排期】草稿（status = 'scheduled'，未来将发布）──────
    const scheduledDrafts = await prisma.contentDraft.findMany({
      where: {
        brandId: brand.id,
        status: 'scheduled',
        scheduledAt: { gte: new Date() },  // 仅检查未来排期
      },
      select: {
        id: true,
        caption: true,
        topicKeywords: true,
        scheduledAt: true,
        publishedAt: true,
      },
    })

    // ── 逐一检查每篇已排期草稿 ───────────────────────────────────────────────
    for (const scheduled of scheduledDrafts) {
      const targetKeywords = scheduled.topicKeywords.length > 0
        ? scheduled.topicKeywords
        : extractTopicKeywords(scheduled.caption)

      if (targetKeywords.length === 0) continue

      const compareAgainst = historicalDrafts.filter((d: { id: string }) => d.id !== scheduled.id)
      const duplicates = detectTopicDuplicates(targetKeywords, compareAgainst, 0.45)

      if (duplicates.length > 0) {
        const top = duplicates[0]
        const daysAgo = top.publishedAt
          ? Math.floor((Date.now() - top.publishedAt.getTime()) / (1000 * 60 * 60 * 24))
          : null

        // ── Q4: 取消排期 — 将草稿从 'scheduled' 改回 'draft'，清除 scheduledAt ──
        await prisma.contentDraft.update({
          where: { id: scheduled.id },
          data: {
            status: 'draft',
            scheduledAt: null,
            agentNote: `⚠️ 【Scheduler 自动取消排期】检测到与 ${daysAgo != null ? `${daysAgo}天前` : '近期'}已发布内容主题相似度达 ${Math.round(top.similarity * 100)}%。已将此草稿退回草稿状态，请修改主题后重新排期。`,
          },
        })

        console.log(`[Scheduler] ↩️ 取消排期 draft ${scheduled.id} (相似度 ${Math.round(top.similarity * 100)}%)`)

        alerts.push({
          brandId: brand.id,
          brandName: brand.name,
          type: 'scheduler_topic_duplicate',
          priority: 'high',  // Q4: 已取消排期，升为 high
          title: `${brand.name} 一篇排期内容因主题重复被自动取消`,
          description: `草稿与 ${daysAgo != null ? `${daysAgo}天前` : '近期'}的内容主题相似度达 ${Math.round(top.similarity * 100)}%，已自动退回草稿状态。请修改主题后重新排期。`,
          payload: {
            unscheduledDraftId: scheduled.id,
            matchedDraftId: top.draftId,
            similarity: top.similarity,
            matchedCaption: top.caption,
            daysAgo,
          },
        })
      }
    }
  }

  return alerts
}

// ─── 3. Failed Posts Check ────────────────────────────────────────────────────

async function checkFailedPosts(
  brands: Awaited<ReturnType<typeof getBrandsWithAccounts>>,
): Promise<SchedulerAlert[]> {
  const alerts: SchedulerAlert[] = []

  for (const brand of brands) {
    const failedDrafts = await prisma.contentDraft.findMany({
      where: {
        brandId: brand.id,
        status: 'failed',
      },
      select: { id: true, caption: true, scheduledAt: true },
    })

    if (failedDrafts.length > 0) {
      alerts.push({
        brandId: brand.id,
        brandName: brand.name,
        type: 'scheduler_publish_failed',
        priority: 'high',
        title: `${brand.name} 有 ${failedDrafts.length} 篇内容发布失败`,
        description: `共有 ${failedDrafts.length} 篇草稿发布失败未处理，请在发布日历中重新排期或手动发布。`,
        payload: {
          failedDraftIds: failedDrafts.map((d: { id: string }) => d.id),
          count: failedDrafts.length,
        },
      })
    }
  }

  return alerts
}

// ─── 4. Write ActionItems ─────────────────────────────────────────────────────

async function writeActionItems(alerts: SchedulerAlert[]): Promise<void> {
  if (alerts.length === 0) return

  // Deduplicate: avoid creating duplicate ActionItems of same type+brand (upsert by title)
  for (const alert of alerts) {
    // Check if identical ActionItem (same brandId + type + title) already exists and is pending
    const existing = await prisma.actionItem.findFirst({
      where: {
        brandId: alert.brandId,
        type: alert.type,
        title: alert.title,
        status: 'pending',
      },
    })

    if (!existing) {
      await prisma.actionItem.create({
        data: {
          brandId: alert.brandId,
          type: alert.type,
          priority: alert.priority,
          title: alert.title,
          description: alert.description,
          payload: alert.payload ?? {},
          status: 'pending',
        },
      })
    }
  }
}

// ─── Main: runSchedulerCheck ──────────────────────────────────────────────────

/**
 * 执行一次完整的 Scheduler 巡检。
 * @param triggeredBy  'cron' | userId（手动触发者）
 * @param windowDays   主题重复检测窗口天数（默认 30）
 */
export async function runSchedulerCheck(
  triggeredBy: string,
  windowDays = 30,
): Promise<SchedulerRunResult> {
  const startTime = Date.now()
  const standards = await getPublishingStandards()
  const brands = await getBrandsWithAccounts()

  // Run all checks in parallel
  const [freqAlerts, duplicateAlerts, failedAlerts] = await Promise.all([
    checkPublishingFrequency(brands, standards),
    checkTopicDuplicates(brands, windowDays),
    checkFailedPosts(brands),
  ])

  const allAlerts = [...freqAlerts, ...duplicateAlerts, ...failedAlerts]

  // Write ActionItems
  await writeActionItems(allAlerts)

  const silenceAlerts = freqAlerts.filter(a => a.type === 'scheduler_silence_alert').length
  const frequencyAlerts = freqAlerts.filter(a => a.type === 'scheduler_frequency_low').length
  const durationMs = Date.now() - startTime

  const summary: SchedulerReportSummary = {
    totalBrands: brands.length,
    alertsGenerated: allAlerts.length,
    silenceAlerts,
    frequencyAlerts,
    duplicateAlerts: duplicateAlerts.length,
    failedPostAlerts: failedAlerts.length,
    durationMs,
    runAt: new Date().toISOString(),
  }

  // Persist SchedulerReport
  const report = await prisma.schedulerReport.create({
    data: {
      triggeredBy,
      summary,
      details: allAlerts,
      status: 'completed',
    },
  })

  console.log(
    `[Scheduler] ✅ 巡检完成 | 品牌:${brands.length} 告警:${allAlerts.length} 耗时:${durationMs}ms`
  )

  return { summary, alerts: allAlerts, reportId: report.id }
}
