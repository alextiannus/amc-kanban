import { prisma } from '@/lib/prisma'
import { postfastDeletePost, postfastPublish } from '@/lib/integrations/postfast'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'

type SubmitDraftInput = {
  brandId: string
  draftId: string
  actorId: string
  forcePublish?: boolean
  note?: string | null
  /** Override auto-scheduling urgency. 'urgent' = publish ASAP; default 'normal' = smart slot */
  urgency?: 'normal' | 'urgent'
  immediatePublish?: boolean
}

function isFuture(value?: Date | null) {
  return !!value && value.getTime() > Date.now()
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
}

/**
 * Compute a smart recommended publish time through the shared service.
 * Called when a draft has no scheduledAt set — ensures all content goes
 * through the unified scheduling algorithm (2-day gap, preferred slots).
 *
 * Returns null if the API is unavailable (caller should handle gracefully).
 */
async function fetchRecommendedScheduleTime(
  brandId: string,
  platform: string,
  urgency: 'normal' | 'urgent' = 'normal',
): Promise<Date | null> {
  try {
    const data = await getSchedulingRecommendations({ brandId, platform, urgency })
    const iso = data.recommendations?.[0]?.recommendedAt
    return iso ? new Date(iso) : null
  } catch {
    return null
  }
}

export async function submitDraftForDelivery(input: SubmitDraftInput) {
  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    select: {
      id: true,
      name: true,
      autoPilot: true,
      postfastApiKey: true,
    },
  })
  if (!brand) return { ok: false as const, status: 404, error: 'Brand not found' }

  const draft = await prisma.contentDraft.findFirst({
    where: { id: input.draftId, brandId: input.brandId },
    include: {
      account: { select: { id: true, platformId: true, handle: true, displayName: true } },
      assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
    },
  })
  if (!draft) return { ok: false as const, status: 404, error: 'Draft not found' }

  // ── 快速校验（在抢锁之前，避免空跑）────────────────────────────────────────
  if (!draft.caption || !draft.caption.trim()) {
    return { ok: false as const, status: 400, error: '草稿正文不能为空。' }
  }

  if (!draft.accountId) {
    return { ok: false as const, status: 400, error: '请先为草稿选择发布账号（确定发布平台）。' }
  }

  // ── 原子互斥锁：防止并发重复发布 ──────────────────────────────────────────
  // 用 updateMany + WHERE status != 'publishing' 代替 findFirst+check 的 TOCTOU 模式。
  // 只有成功把状态从「非 publishing」改成「publishing」的那一个请求才能继续，
  // 其余并发请求 count=0 直接返回 409，与人工点击"审批"完全等效。
  //
  // 例外：autoPilot=false 且非 forcePublish 时走 pending_review 路径，无需抢锁。
  const needsPublishingLock = brand.autoPilot || input.forcePublish
  if (needsPublishingLock) {
    const lockResult = await prisma.contentDraft.updateMany({
      where: {
        id: input.draftId,
        brandId: input.brandId,
        status: { not: 'publishing' },
      },
      data: { status: 'publishing' },
    })
    if (lockResult.count === 0) {
      console.warn(`[submitDraftForDelivery] Draft ${input.draftId} already locked (status=publishing), rejecting concurrent request`)
      return { ok: false as const, status: 409, error: '发布正在进行中，请稍候再试。' }
    }
    console.log(`[submitDraftForDelivery] Lock acquired for draft ${input.draftId}`)
  }

  if (!brand.autoPilot && !input.forcePublish) {
    const updated = await prisma.$transaction(async (tx: any) => {
      const nextDraft = await tx.contentDraft.update({
        where: { id: draft.id },
        data: { status: 'pending_review', rejectionNote: null },
        include: {
          account: { select: { id: true, platformId: true, handle: true, displayName: true } },
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
        },
      })

      await tx.actionItem.upsert({
        where: { draftId: draft.id },
        create: {
          brandId: input.brandId,
          accountId: draft.accountId,
          type: 'content_approval',
          priority: 'normal',
          title: `审核草稿：${draft.caption.slice(0, 36)}`,
          description: draft.caption,
          status: 'pending',
          agentId: draft.agentId,
          draftId: draft.id,
        },
        update: {
          accountId: draft.accountId,
          title: `审核草稿：${draft.caption.slice(0, 36)}`,
          description: draft.caption,
          status: 'pending',
          resolvedAt: null,
          resolvedBy: null,
          resolvedNote: null,
        },
      })

      return nextDraft
    })

    void persistDraftSnapshotToObs({ brandId: input.brandId, draftId: draft.id, data: updated }).catch((error) => {
      console.error('[submitDraftForDelivery] OBS pending snapshot failed:', error)
    })

    return { ok: true as const, mode: 'approval_required' as const, draft: updated }
  }

  if (!draft.account?.platformId) {
    return { ok: false as const, status: 400, error: '请先为草稿选择发布账号。' }
  }

  if (draft.account.handle === 'unconfigured') {
    // Unconfigured accounts (e.g. 小红书/Facebook not yet connected) cannot be
    // auto-published. Content is saved as a plain 'draft' so it does NOT appear
    // in the calendar. Users must manually export and publish to the platform.
    const updated = await prisma.contentDraft.update({
      where: { id: draft.id },
      data: {
        status: 'draft',
        publishedAt: null,
        scheduledAt: null,
        agentNote: '该平台尚未配置发布渠道，内容已保存为草稿，请手动复制内容发布到对应平台。',
        rejectionNote: null,
      },
      include: {
        account: { select: { id: true, platformId: true, handle: true, displayName: true } },
        assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
      },
    })

    void persistDraftSnapshotToObs({ brandId: input.brandId, draftId: draft.id, data: updated }).catch((error) => {
      console.error('[submitDraftForDelivery] OBS draft snapshot failed:', error)
    })

    return {
      ok: true as const,
      mode: 'draft' as any,
      draft: updated,
    }
  }


  if (!brand.postfastApiKey) {
    await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: 'failed', agentNote: '发布失败：品牌尚未配置 PostFast API Key。' } })
    return { ok: false as const, status: 400, error: '品牌尚未配置 PostFast API Key。' }
  }

  if (draft.platformPostId && !draft.publishedAt) {
    const cancelResult = await postfastDeletePost(brand.postfastApiKey, draft.platformPostId)
    if (!cancelResult.success) {
      // 检查是否是「帖子已不存在」的错误（说明 PostFast 已经发出或删除了该帖）
      // 这种情况下可以安全清除旧 ID 并继续
      const isNotFound = cancelResult.error?.includes('404') ||
        cancelResult.error?.toLowerCase().includes('not found') ||
        cancelResult.error?.includes('does not exist')

      if (isNotFound) {
        // 旧帖已不在 PostFast 中（已发布或已被删除），安全清除后继续
        console.warn(`[submitDraftForDelivery] Old post ${draft.platformPostId} not found in PostFast (already published or deleted), clearing and proceeding`)
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: { platformPostId: null },
        })
      } else {
        // 取消失败（未知错误）— 阻断流程，防止重复帖子
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: { status: 'failed', agentNote: `发布失败：无法取消旧排期 ${draft.platformPostId}，请稍后重试。${cancelResult.error || ''}` },
        })
        return {
          ok: false as const,
          status: 400,
          error: input.immediatePublish
            ? `PostFast 无法取消旧排期，请稍等几秒后重试立即发布。（${cancelResult.error || '未知错误'}）`
            : `无法取消旧排期，未创建新排期。（${cancelResult.error || '未知错误'}）`,
        }
      }
    }
  }

  // status is already 'publishing' — set by the atomic lock above. Only clear rejectionNote.
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { rejectionNote: null } })


  // ── Auto-schedule: if no scheduledAt, get the optimal time from the scheduling API ──
  // This is the unified enforcement point: ALL submissions (AI, human, voice, bulk)
  // go through the smart scheduling algorithm. Only urgency='urgent' gets a near-slot.
  let resolvedScheduledAt = draft.scheduledAt
  const isRescheduleRequested = typeof input.note === 'string' &&
    (input.note.includes('重新智能排期') || input.note.includes('智能重新排期'))

  if (input.immediatePublish) {
    // PostFast API docs: status only accepts DRAFT or SCHEDULED.
    // scheduledAt is required when status=SCHEDULED (the default), and MUST be in the future.
    // For "immediate" publish, set scheduledAt 2 minutes ahead — PostFast picks it up within minutes.
    resolvedScheduledAt = new Date(Date.now() + 2 * 60 * 1000)
    console.log(`[submitDraftForDelivery] IMMEDIATE PUBLISH: setting scheduledAt 2 min ahead → ${resolvedScheduledAt.toISOString()}`)
  } else if (!resolvedScheduledAt || isRescheduleRequested) {
    const recommended = await fetchRecommendedScheduleTime(
      input.brandId,
      draft.account.platformId,
      input.urgency ?? 'normal',
    )
    if (recommended) {
      resolvedScheduledAt = recommended
      // Persist the recommended time back to DB for visibility/audit trail
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: { scheduledAt: resolvedScheduledAt },
      })
      console.log(`[submitDraftForDelivery] Auto-scheduled ${draft.id} → ${resolvedScheduledAt.toISOString()} (platform: ${draft.account.platformId})`)
    } else {
      // Recommend API unavailable — fall through to immediate publish (graceful degradation)
      console.warn(`[submitDraftForDelivery] Could not get schedule recommendation for draft ${draft.id}, publishing immediately`)
    }
  }

  // For immediate publish: even though we pass scheduledAt 2 minutes ahead to PostFast
  // (required by their API), the user explicitly chose immediate publish — the post will
  // be live within minutes. Write 'published' directly so the UI reflects reality.
  // For scheduled posts: only mark as 'scheduled' if the time is genuinely in the future.
  const scheduled = !input.immediatePublish && isFuture(resolvedScheduledAt)

  const mediaUrls = uniq([
    ...draft.mediaUrls,
    ...draft.assetRefs.map((ref: any) => ref.asset.url),
  ])

  console.log(`[submitDraftForDelivery] Calling postfastPublish — platform: ${draft.account.platformId}, scheduledAt: ${resolvedScheduledAt?.toISOString() ?? 'undefined (immediate)'}, immediatePublish: ${input.immediatePublish}, draftId: ${draft.id}`)
  const result = await postfastPublish({
    apiKey: brand.postfastApiKey,
    platform: draft.account.platformId,
    accountId: draft.accountId || undefined,
    caption: draft.caption,
    mediaUrls,
    hashtags: draft.hashtags,
    scheduledAt: resolvedScheduledAt?.toISOString(),
  })
  console.log(`[submitDraftForDelivery] postfastPublish result: success=${result.success}, postId=${result.postId ?? 'none'}, error=${result.error ?? 'none'}`)

  const updated = await prisma.contentDraft.update({
    where: { id: draft.id },
    data: result.success
      ? {
          status: scheduled ? 'scheduled' : 'published',
          platformPostId: result.postId || null,
          publishedAt: scheduled ? null : new Date(),
          agentNote: input.note || (scheduled ? '已按最新草稿重新排期。' : '已按最新草稿发布。'),
          rejectionNote: null,
        }
      : {
          status: 'failed',
          agentNote: `发布失败：${result.error || 'unknown error'}`,
        },
    include: {
      account: { select: { id: true, platformId: true, handle: true, displayName: true } },
      assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
    },
  })

  if (result.success) {
    await prisma.actionItem.updateMany({
      where: { draftId: draft.id, brandId: input.brandId, status: 'pending' },
      data: {
        status: 'approved',
        resolvedAt: new Date(),
        resolvedBy: input.actorId,
        resolvedNote: input.note || (brand.autoPilot ? '自动驾驶模式提交发布' : '主理人批准发布'),
      },
    })

    // Closed-loop feedback: process and save SFT/DPO dataset
    const { processDraftCuration } = await import('./feedbackService')
    processDraftCuration(input.brandId, draft.id, draft.caption).catch((err) => {
      console.error('[submitDraftForDelivery] feedback curation loop failed:', err)
    })
  }

  void persistDraftSnapshotToObs({ brandId: input.brandId, draftId: draft.id, data: updated }).catch((error) => {
    console.error('[submitDraftForDelivery] OBS delivered snapshot failed:', error)
  })

  return result.success
    ? { ok: true as const, mode: scheduled ? 'scheduled' as const : 'published' as const, draft: updated, postId: result.postId, url: result.url }
    : { ok: false as const, status: 400, error: result.error || '发布失败', draft: updated }
}
