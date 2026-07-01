import { prisma } from '@/lib/prisma'
import { postfastDeletePost, postfastPublish } from '@/lib/integrations/postfast'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'

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
 * Auto-fetch a smart recommended publish time from the scheduling API.
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
    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const res = await fetch(`${appBase}/api/brands/${brandId}/scheduling/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-forwarded-for': 'internal', // internal bypass — no session needed
      },
      body: JSON.stringify({ platform, numberOfPosts: 1, urgency }),
    })
    if (!res.ok) return null
    const data = await res.json()
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
  
  if (!draft.caption || !draft.caption.trim()) {
    return { ok: false as const, status: 400, error: '草稿正文不能为空。' }
  }

  if (!draft.accountId) {
    return { ok: false as const, status: 400, error: '请先为草稿选择发布账号（确定发布平台）。' }
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
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: { status: 'failed', agentNote: `更新排期失败：无法取消旧排期 ${draft.platformPostId}。${cancelResult.error || ''}` },
      })
      return { ok: false as const, status: 400, error: cancelResult.error || '无法取消旧排期，未创建新排期。' }
    }
  }

  await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: 'publishing', rejectionNote: null } })

  // ── Auto-schedule: if no scheduledAt, get the optimal time from the scheduling API ──
  // This is the unified enforcement point: ALL submissions (AI, human, voice, bulk)
  // go through the smart scheduling algorithm. Only urgency='urgent' gets a near-slot.
  let resolvedScheduledAt = draft.scheduledAt
  const isRescheduleRequested = typeof input.note === 'string' &&
    (input.note.includes('重新智能排期') || input.note.includes('智能重新排期'))

  if (input.immediatePublish) {
    resolvedScheduledAt = null
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

  const mediaUrls = uniq([
    ...draft.mediaUrls,
    ...draft.assetRefs.map((ref: any) => ref.asset.url),
  ])

  const result = await postfastPublish({
    apiKey: brand.postfastApiKey,
    platform: draft.account.platformId,
    accountId: draft.accountId || undefined,
    caption: draft.caption,
    mediaUrls,
    hashtags: draft.hashtags,
    scheduledAt: resolvedScheduledAt?.toISOString(),
  })

  const scheduled = isFuture(resolvedScheduledAt)
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
