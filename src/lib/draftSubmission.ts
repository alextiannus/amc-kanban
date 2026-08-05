import { prisma } from '@/lib/prisma'
import { postfastDeletePost, postfastPublish } from '@/lib/integrations/postfast'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'
import { buildPostfastCoverImage, buildPostfastMediaItems } from '@/lib/publishMedia'
import { validateDraftMediaForPlatform } from '@/lib/publishMediaValidation'
import { shouldValidateMediaForDraftDelivery } from '@/lib/mediaPublishPolicy'
import {
  blockingMediaIssues,
  mediaValidationWarnings,
  type MediaValidationIssue,
} from '@/lib/mediaValidation'
import { writeAuditLog } from '@/lib/audit'
import { POSTFAST_RESULT_UNKNOWN } from '@/lib/syncDraftStatuses'

type SubmitDraftInput = {
  brandId: string
  draftId: string
  actorId: string
  forcePublish?: boolean
  note?: string | null
  /** Override auto-scheduling urgency. 'urgent' = publish ASAP; default 'normal' = smart slot */
  urgency?: 'normal' | 'urgent'
  immediatePublish?: boolean
  confirmedUnknownResult?: boolean
}

function isFuture(value?: Date | null) {
  return !!value && value.getTime() > Date.now()
}

function normalizePublishPlatform(platform?: string | null) {
  const normalized = String(platform ?? '').toLowerCase().trim()
  if (['google_business', 'google_maps', 'google_map', 'google_business_profile', 'gbp', 'gmb'].includes(normalized)) {
    return 'google'
  }
  return normalized
}

function mergeMediaWarnings(...groups: Array<MediaValidationIssue[] | undefined>) {
  const seen = new Set<string>()
  return groups.flatMap((group) => group ?? []).filter((warning) => {
    const key = [
      warning.assetId ?? '',
      warning.filename,
      warning.platform ?? '',
      warning.field,
      String(warning.actual),
      String(warning.limit),
    ].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
      coverAsset: true,
    },
  })
  if (!draft) return { ok: false as const, status: 404, error: 'Draft not found' }
  const immediatePublish = !!(input.immediatePublish || input.note === '立即发布')

  if (draft.deliveryFailureCode === POSTFAST_RESULT_UNKNOWN && !input.confirmedUnknownResult) {
    return {
      ok: false as const,
      status: 409,
      code: 'POSTFAST_RESULT_CONFIRMATION_REQUIRED',
      error: 'PostFast 的上次发布结果无法确认。请先检查对应社交平台，确认内容尚未发布后再重新排期。',
    }
  }

  if (draft.deliveryFailureCode === POSTFAST_RESULT_UNKNOWN && input.confirmedUnknownResult) {
    await writeAuditLog({
      actor: { id: input.actorId, type: 'HUMAN' },
      action: 'CONFIRM_UNKNOWN_POSTFAST_RESULT_NOT_PUBLISHED',
      resourceId: draft.id,
      resourceType: 'ContentDraft',
      oldValue: { status: draft.status, deliveryFailureCode: draft.deliveryFailureCode },
      reason: 'User confirmed the social platform was checked before retrying delivery.',
      metadata: { brandId: input.brandId },
    })
  }

  // ── 快速校验（在抢锁之前，避免空跑）────────────────────────────────────────
  if (!draft.caption || !draft.caption.trim()) {
    return { ok: false as const, status: 400, error: '草稿正文不能为空。' }
  }

  // P1 HARD BLOCK: never publish AI placeholder captions.
  // This covers the race condition where trigger-copywriter hasn't finished yet
  // and a reviewer tries to approve the draft before real content is generated.
  const AI_PLACEHOLDER = '【AI 正在创作中...】'
  if (draft.caption.includes(AI_PLACEHOLDER) || draft.caption.trim() === AI_PLACEHOLDER) {
    return {
      ok: false as const,
      status: 400,
      error: 'AI 正在生成文案中，请稍候再审核。草稿尚未包含真实内容，暂不可发布。',
    }
  }

  if (!draft.account?.platformId) {
    return { ok: false as const, status: 400, error: '请先为草稿选择发布账号。' }
  }

  const platformId = normalizePublishPlatform(draft.account.platformId)
  const shouldValidateForPublish = shouldValidateMediaForDraftDelivery({
    autoPilot: brand.autoPilot,
    forcePublish: input.forcePublish,
    accountHandle: draft.account.handle,
  })
  let validationWarnings: MediaValidationIssue[] = []
  if (shouldValidateForPublish) {
    const mediaIssues = await validateDraftMediaForPlatform({
      platform: platformId,
      mediaUrls: draft.mediaUrls,
      assetRefs: draft.assetRefs,
      coverAsset: draft.coverAsset,
    })
    const blockingIssues = blockingMediaIssues(mediaIssues)
    validationWarnings = mediaValidationWarnings(mediaIssues)
    if (blockingIssues.length > 0) {
      return {
        ok: false as const,
        status: 422,
        code: 'MEDIA_VALIDATION_FAILED',
        error: '素材不符合发布要求',
        issues: blockingIssues,
        warnings: validationWarnings,
      }
    }
  }

  if (!draft.accountId) {
    return { ok: false as const, status: 400, error: '请先为草稿选择发布账号（确定发布平台）。' }
  }

  // 已经排期的post，一定要先确认之前的排期成功取消掉，否则不要安排新的发布避免重复
  if (draft.platformPostId && !draft.publishedAt) {
    if (!brand.postfastApiKey) {
      return { ok: false as const, status: 400, error: '品牌尚未配置 PostFast API Key，无法取消排期。' }
    }
    const cancelResult = await postfastDeletePost(brand.postfastApiKey, draft.platformPostId)
    if (!cancelResult.success) {
      const isNotFound = cancelResult.error?.includes('404') ||
        cancelResult.error?.toLowerCase().includes('not found') ||
        cancelResult.error?.includes('does not exist')

      if (isNotFound) {
        console.warn(`[submitDraftForDelivery] Old post ${draft.platformPostId} not found in PostFast (already published or deleted), clearing and proceeding`)
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: { platformPostId: null },
        })
        draft.platformPostId = null
      } else {
        // 取消失败（未知错误）— 阻断流程，防止重复帖子
        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: {
            status: 'failed',
            deliveryFailureCode: 'POSTFAST_CANCEL_FAILED',
            deliveryFailureAt: new Date(),
            agentNote: `当前排期取消失败，无法重新排期。${cancelResult.error || ''}`
          },
        })
        return {
          ok: false as const,
          status: 400,
          error: `当前排期取消失败，无法重新排期。（${cancelResult.error || '未知错误'}）`,
        }
      }
    } else {
      // 成功取消，清除 platformPostId
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: { platformPostId: null },
      })
      draft.platformPostId = null
    }
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
      data: {
        status: 'publishing',
        deliveryFailureCode: null,
        deliveryFailureAt: null,
      },
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
          coverAsset: true,
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

    return {
      ok: true as const,
      mode: 'approval_required' as const,
      draft: updated,
      warnings: validationWarnings,
    }
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
        deliveryFailureCode: null,
        deliveryFailureAt: null,
        agentNote: '该平台尚未配置发布渠道，内容已保存为草稿，请手动复制内容发布到对应平台。',
        rejectionNote: null,
      },
      include: {
        account: { select: { id: true, platformId: true, handle: true, displayName: true } },
        assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
        coverAsset: true,
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
    await prisma.contentDraft.update({
      where: { id: draft.id },
      data: {
        status: 'failed',
        deliveryFailureCode: 'POSTFAST_NOT_CONFIGURED',
        deliveryFailureAt: new Date(),
        agentNote: '发布失败：品牌尚未配置 PostFast API Key。',
      },
    })
    return { ok: false as const, status: 400, error: '品牌尚未配置 PostFast API Key。' }
  }



  // status is already 'publishing' — set by the atomic lock above. Only clear rejectionNote.
  await prisma.contentDraft.update({ where: { id: draft.id }, data: { rejectionNote: null } })


  // ── Auto-schedule: if no scheduledAt, get the optimal time from the scheduling API ──
  // This is the unified enforcement point: ALL submissions (AI, human, voice, bulk)
  // go through the smart scheduling algorithm. Only urgency='urgent' gets a near-slot.
  let resolvedScheduledAt = draft.scheduledAt
  const isRescheduleRequested = typeof input.note === 'string' &&
    (input.note.includes('重新智能排期') || input.note.includes('智能重新排期'))

  if (immediatePublish) {
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
  const scheduled = !immediatePublish && isFuture(resolvedScheduledAt)

  const mediaItems = buildPostfastMediaItems({
    mediaUrls: draft.mediaUrls,
    assetRefs: draft.assetRefs,
  })
  const coverImage = buildPostfastCoverImage(draft.coverAsset)

  console.log(`[submitDraftForDelivery] Calling postfastPublish — platform: ${platformId}, scheduledAt: ${resolvedScheduledAt?.toISOString() ?? 'undefined (immediate)'}, immediatePublish: ${input.immediatePublish}, draftId: ${draft.id}`)
  const result = await postfastPublish({
    apiKey: brand.postfastApiKey,
    platform: platformId,
    accountId: draft.accountId || undefined,
    caption: draft.caption,
    mediaItems,
    coverImage,
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
          deliveryFailureCode: null,
          deliveryFailureAt: null,
          agentNote: input.note || (scheduled ? '已按最新草稿重新排期。' : '已按最新草稿发布。'),
          rejectionNote: null,
        }
      : result.code === 'MEDIA_VALIDATION_FAILED' ||
        result.code === 'MEDIA_INSPECTION_UNAVAILABLE' ||
        result.code === 'POSTFAST_PUBLISH_TIMEOUT'
      ? {
          status: result.code === 'POSTFAST_PUBLISH_TIMEOUT' ? 'publishing' : draft.status,
          deliveryFailureCode: result.code === 'POSTFAST_PUBLISH_TIMEOUT'
            ? 'POSTFAST_PUBLISH_TIMEOUT'
            : null,
          deliveryFailureAt: result.code === 'POSTFAST_PUBLISH_TIMEOUT' ? new Date() : null,
          ...(result.code === 'POSTFAST_PUBLISH_TIMEOUT'
            ? { agentNote: 'PostFast 发布请求超时，系统将在30分钟内自动核对最终结果。' }
            : {}),
        }
      : {
          status: 'failed',
          deliveryFailureCode: result.code || 'POSTFAST_PUBLISH_FAILED',
          deliveryFailureAt: new Date(),
          agentNote: `发布失败：${result.error || 'unknown error'}`,
        },
    include: {
      account: { select: { id: true, platformId: true, handle: true, displayName: true } },
      assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
      coverAsset: true,
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

  const warnings = mergeMediaWarnings(validationWarnings, result.warnings)
  return result.success
    ? {
        ok: true as const,
        mode: scheduled ? 'scheduled' as const : 'published' as const,
        draft: updated,
        postId: result.postId,
        url: result.url,
        warnings,
      }
    : {
        ok: false as const,
        status: result.code === 'MEDIA_VALIDATION_FAILED'
          ? 422
          : result.code === 'MEDIA_INSPECTION_UNAVAILABLE'
            ? 503
            : result.code === 'POSTFAST_PUBLISH_TIMEOUT'
              ? 504
              : 400,
        code: result.code,
        issues: result.issues,
        warnings,
        error: result.error || '发布失败',
        draft: updated,
      }
}
