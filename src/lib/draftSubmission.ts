import { prisma } from '@/lib/prisma'
import { postfastDeletePost, postfastPublish } from '@/lib/integrations/postfast'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'

type SubmitDraftInput = {
  brandId: string
  draftId: string
  actorId: string
  forcePublish?: boolean
  note?: string | null
}

function isFuture(value?: Date | null) {
  return !!value && value.getTime() > Date.now()
}

function uniq(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)))
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

  if (!brand.autoPilot && !input.forcePublish) {
    const updated = await prisma.$transaction(async (tx) => {
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

  const mediaUrls = uniq([
    ...draft.mediaUrls,
    ...draft.assetRefs.map((ref) => ref.asset.url),
  ])

  const result = await postfastPublish({
    apiKey: brand.postfastApiKey,
    platform: draft.account.platformId,
    accountId: draft.accountId || undefined,
    caption: draft.caption,
    mediaUrls,
    hashtags: draft.hashtags,
    scheduledAt: draft.scheduledAt?.toISOString(),
  })

  const scheduled = isFuture(draft.scheduledAt)
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
  }

  void persistDraftSnapshotToObs({ brandId: input.brandId, draftId: draft.id, data: updated }).catch((error) => {
    console.error('[submitDraftForDelivery] OBS delivered snapshot failed:', error)
  })

  return result.success
    ? { ok: true as const, mode: scheduled ? 'scheduled' as const : 'published' as const, draft: updated, postId: result.postId, url: result.url }
    : { ok: false as const, status: 400, error: result.error || '发布失败', draft: updated }
}
