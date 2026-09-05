import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'
import { parseBrandComplianceConfig, validateContentCompliance } from '@/lib/compliance'
import { actorFromContext, writeAuditLog } from '@/lib/audit'
import { eventEmitter } from '@/lib/events'
import { findActivePostfastDeliveryJob } from '@/lib/postfastDelivery'
import { sanitizePostFastDraftControls } from '@/lib/integrations/postfast'

const DRAFT_SELECT = {
  id: true,
  brandId: true,
  accountId: true,
  gbpLocationId: true,
  instagramPublishType: true,
  postfastControls: true,
  caption: true,
  captionLang: true,
  mediaUrls: true,
  coverAssetId: true,
  coverAsset: true,
  hashtags: true,
  scheduledAt: true,
  status: true,
  agentId: true,
  agentNote: true,
  rejectionNote: true,
  platformPostId: true,
  postUrl: true,
  publishedAt: true,
  deliveryFailureCode: true,
  deliveryFailureAt: true,
  creativeHooks: true,
  viralCopyScriptId: true,
  viralCopyScriptVersionId: true,
  viralCopyScriptName: true,
  viralCopyScriptSelection: true,
  viralCopyScriptProvenance: true,
  viralCopyExperimentId: true,
  viralCopyExperimentAssignmentId: true,
  viralCopyExperimentArm: true,
  viralCopyExperimentOverridden: true,
  viralCopyExperimentExcluded: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, platformId: true, handle: true, displayName: true } },
  assetRefs: {
    orderBy: { order: 'asc' as const },
    include: { asset: true },
  },
  postfastDeliveryJobs: {
    orderBy: { createdAt: 'desc' as const },
    take: 1,
    select: {
      id: true,
      status: true,
      attempts: true,
      nextAttemptAt: true,
      lastErrorCode: true,
      lastErrorMessage: true,
      createdAt: true,
      updatedAt: true,
    },
  },
} as const

type Params = { params: Promise<{ id: string; draftId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

function normalizeStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : []
}

function isGooglePlatform(platformId?: string | null) {
  return ['google', 'google_business', 'google_maps', 'google_map', 'google_business_profile', 'google_my_business', 'gbp', 'gmb']
    .includes(String(platformId ?? '').toLowerCase().trim())
}

function optionalInstagramPublishType(value: unknown) {
  if (value === undefined || value === null || value === '') return null
  return value === 'TIMELINE' || value === 'REEL' || value === 'STORY' ? value : false
}

async function ensureAccess(request: Request, brandId: string) {
  const actor = await getActor(request)
  if (!actor) return null
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  return ok ? actor : null
}

export async function GET(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = await prisma.contentDraft.findFirst({ where: { id: draftId, brandId }, select: DRAFT_SELECT })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let postUrl = draft.postUrl || undefined
  if (!postUrl && draft.status === 'published' && draft.platformPostId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
    if (brand?.postfastApiKey) {
      const { postfastListPosts } = await import('@/lib/integrations/postfast')
      const pfResult = await postfastListPosts(brand.postfastApiKey, { status: 'published' })
      if (pfResult.success) {
        const pfPost = pfResult.posts.find((p) => p.id === draft.platformPostId)
        if (pfPost?.postUrl) {
          postUrl = pfPost.postUrl
          await prisma.contentDraft.update({
            where: { id: draft.id },
            data: { postUrl }
          }).catch((err: any) => console.error('Failed to cache draft postUrl in GET:', err))
        }
      }
    }
  }

  return NextResponse.json({ draft: { ...draft, postUrl } })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const existing = await prisma.contentDraft.findFirst({
    where: { id: draftId, brandId },
    select: {
      id: true,
      status: true,
      platformPostId: true,
      publishedAt: true,
      scheduledAt: true,   // needed to detect time changes
      coverAssetId: true,
      accountId: true,
      gbpLocationId: true,
      instagramPublishType: true,
      postfastControls: true,
    },
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))

  const hasInstagramPublishTypeUpdate = Object.prototype.hasOwnProperty.call(body, 'instagramPublishType')
  const instagramPublishTypeUpdate = hasInstagramPublishTypeUpdate
    ? optionalInstagramPublishType(body.instagramPublishType)
    : undefined
  if (instagramPublishTypeUpdate === false) {
    return NextResponse.json({ error: 'instagramPublishType must be TIMELINE, REEL, STORY, or null' }, { status: 400 })
  }
  const hasPostfastControlsUpdate = Object.prototype.hasOwnProperty.call(body, 'postfastControls')
  const parsedPostfastControls = hasPostfastControlsUpdate ? sanitizePostFastDraftControls(body.postfastControls) : {}
  if (parsedPostfastControls.error) return NextResponse.json({ error: parsedPostfastControls.error }, { status: 400 })

  if (existing.status === 'publishing' && Object.prototype.hasOwnProperty.call(body, 'gbpLocationId')) {
    return NextResponse.json({ error: '发布正在进行中，Google Business 发布门店暂时不能修改。' }, { status: 409 })
  }

  const publishCriticalFields = [
    'caption', 'captionLang', 'accountId', 'mediaUrls', 'assetIds', 'coverAssetId',
    'hashtags', 'scheduledAt', 'status', 'gbpLocationId', 'instagramPublishType', 'postfastControls',
  ]
  if (existing.status === 'publishing' && publishCriticalFields.some((field) => Object.prototype.hasOwnProperty.call(body, field))) {
    const activeJob = await findActivePostfastDeliveryJob(draftId)
    if (activeJob) {
      return NextResponse.json(
        { error: '大视频正在后台发布，正文、账号、媒体和排期暂时不能修改。', jobId: activeJob.id, status: activeJob.status },
        { status: 409 },
      )
    }
  }
  
  if (body.caption !== undefined) {
    const trimmedCaption = typeof body.caption === 'string' ? body.caption.trim() : ''
    if (!trimmedCaption) {
      return NextResponse.json({ error: 'caption cannot be empty' }, { status: 400 })
    }

    // Run compliance checks on new caption before updating draft
    const complianceConfig = await parseBrandComplianceConfig(brandId)
    if (complianceConfig) {
      const validation = validateContentCompliance(trimmedCaption, complianceConfig)
      if (!validation.isValid) {
        return NextResponse.json(
          { error: `内容包含品牌违禁词: ${validation.matchedProhibitedWords.join(', ')}，请调整后重新提交。` },
          { status: 400 }
        )
      }
    }
  }

  if (body.accountId !== undefined) {
    let accountIdVal = typeof body.accountId === 'string' ? body.accountId.trim() : ''
    if (!accountIdVal) {
      return NextResponse.json({ error: 'accountId is required (platform must be determined)' }, { status: 400 })
    }
    if (accountIdVal.startsWith('unconfigured_')) {
      const platformId = accountIdVal.replace('unconfigured_', '')
      let placeholderAccount = await prisma.socialAccount.findFirst({
        where: { brandId, platformId, handle: 'unconfigured' }
      })
      if (!placeholderAccount) {
        const getDisplayName = (pId: string) => {
          const lower = pId.toLowerCase()
          if (lower === 'google_business' || lower === 'google') return 'Google Business (未配置)'
          if (lower === 'xiaohongshu' || lower === 'rednote' || lower === 'red' || lower === 'xhs') return '小红书 / Rednote (未配置)'
          if (lower === 'instagram') return 'Instagram (未配置)'
          if (lower === 'facebook') return 'Facebook (未配置)'
          if (lower === 'tiktok') return 'TikTok (未配置)'
          return `${pId.charAt(0).toUpperCase() + pId.slice(1)} (未配置)`
        }
        placeholderAccount = await prisma.socialAccount.create({
          data: {
            brandId,
            platformId,
            handle: 'unconfigured',
            displayName: getDisplayName(platformId),
          }
        })
      }
      body.accountId = placeholderAccount.id
    }
  }

  if (body.gbpLocationId !== undefined && body.gbpLocationId !== null && typeof body.gbpLocationId !== 'string') {
    return NextResponse.json({ error: 'gbpLocationId must be a string or null' }, { status: 400 })
  }
  const nextAccountId = typeof body.accountId === 'string' ? body.accountId : existing.accountId
  const nextAccount = nextAccountId
    ? await prisma.socialAccount.findFirst({
        where: { id: nextAccountId, brandId },
        select: { platformId: true },
      })
    : null
  if (!nextAccount) return NextResponse.json({ error: 'accountId is invalid for this brand' }, { status: 400 })
  const hasGbpLocationUpdate = Object.prototype.hasOwnProperty.call(body, 'gbpLocationId')
  const accountChanged = typeof body.accountId === 'string' && body.accountId !== existing.accountId
  const gbpLocationIdUpdate = !isGooglePlatform(nextAccount.platformId)
    ? null
    : hasGbpLocationUpdate
      ? (typeof body.gbpLocationId === 'string' ? body.gbpLocationId.trim() || null : null)
      : accountChanged
        ? null
        : undefined
  const gbpLocationChanged = gbpLocationIdUpdate !== undefined && gbpLocationIdUpdate !== existing.gbpLocationId

  const assetIds = Array.isArray(body.assetIds) ? normalizeStringArray(body.assetIds) : null
  const hasCoverAssetUpdate = Object.prototype.hasOwnProperty.call(body, 'coverAssetId')
  if (hasCoverAssetUpdate && body.coverAssetId !== null && typeof body.coverAssetId !== 'string') {
    return NextResponse.json({ error: 'coverAssetId must be a string or null' }, { status: 400 })
  }
  const requestedCoverAssetId = typeof body.coverAssetId === 'string' ? body.coverAssetId.trim() : ''
  const coverAsset = hasCoverAssetUpdate && requestedCoverAssetId
    ? await prisma.mediaAsset.findFirst({
        where: { id: requestedCoverAssetId, brandId, mimeType: { in: ['image/jpeg', 'image/png'] } },
        select: { id: true, aiTags: true },
      })
    : null
  if (hasCoverAssetUpdate && requestedCoverAssetId && !coverAsset) {
    return NextResponse.json({ error: 'coverAssetId must reference a JPEG or PNG image in this brand' }, { status: 400 })
  }
  const coverAssetIdUpdate = hasCoverAssetUpdate ? (coverAsset?.id ?? null) : undefined
  const nextStatus = typeof body.status === 'string' ? body.status : undefined
  const hasPostUrlUpdate = Object.prototype.hasOwnProperty.call(body, 'postUrl')
  const postUrlUpdate = hasPostUrlUpdate ? normalizeOptionalHttpUrl(body.postUrl) : undefined
  if (postUrlUpdate === false) {
    return NextResponse.json({ error: 'postUrl must be an http(s) URL or null' }, { status: 400 })
  }

  let platformPostIdUpdate: string | null | undefined = undefined
  const isScheduledOnPostfast = !!existing.platformPostId && !existing.publishedAt

  // Detect scheduledAt change for a post that is already queued on PostFast
  const incomingScheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt
    ? new Date(body.scheduledAt)
    : undefined
  const scheduledAtChanged = incomingScheduledAt !== undefined &&
    isScheduledOnPostfast &&
    (!existing.scheduledAt || Math.abs(incomingScheduledAt.getTime() - existing.scheduledAt.getTime()) > 60_000)

  let brand: { postfastApiKey: string | null; timezone: string | null } | null = null
  if (isScheduledOnPostfast && (nextStatus && ['draft', 'pending_review', 'rejected'].includes(nextStatus) || scheduledAtChanged || gbpLocationChanged)) {
    brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { postfastApiKey: true, timezone: true }
    })
    if (brand?.postfastApiKey) {
      const { postfastDeletePost } = await import('@/lib/integrations/postfast')
      const cancelResult = await postfastDeletePost(brand.postfastApiKey, existing.platformPostId!)
      if (cancelResult.success) {
        platformPostIdUpdate = null
      } else {
        const isGone = (cancelResult.error || '').toLowerCase().includes('not found') ||
          (cancelResult.error || '').includes('404')
        if (isGone) {
          platformPostIdUpdate = null // already gone from PostFast — safe to clear
        } else {
          console.warn(`[PATCH Draft] Failed to cancel scheduled post on PostFast: ${cancelResult.error}`)
          return NextResponse.json(
            { error: `当前排期取消失败，无法重新排期。（${cancelResult.error || '未知错误'}）` },
            { status: 400 }
          )
        }
      }
    }
  }

  const draft = await prisma.$transaction(async (tx: any) => {
    const updated = await tx.contentDraft.update({
      where: { id: draftId },
      data: {
        caption: typeof body.caption === 'string' ? body.caption.trim() : undefined,
        captionLang: typeof body.captionLang === 'string' ? body.captionLang : undefined,
        accountId: typeof body.accountId === 'string' ? body.accountId : undefined,
        gbpLocationId: gbpLocationIdUpdate,
        instagramPublishType: instagramPublishTypeUpdate,
        postfastControls: hasPostfastControlsUpdate ? parsedPostfastControls.controls ?? null : undefined,
        mediaUrls: Array.isArray(body.mediaUrls) ? normalizeStringArray(body.mediaUrls) : undefined,
        coverAssetId: coverAssetIdUpdate,
        hashtags: Array.isArray(body.hashtags) ? normalizeStringArray(body.hashtags) : undefined,
        scheduledAt: typeof body.scheduledAt === 'string' ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : undefined,
        status: nextStatus,
        platformPostId: platformPostIdUpdate,
        postUrl: postUrlUpdate,
        agentNote: typeof body.agentNote === 'string' ? body.agentNote : undefined,
        rejectionNote: nextStatus === 'pending_review' ? null : typeof body.rejectionNote === 'string' ? body.rejectionNote : undefined,
        creativeHooks: typeof body.creativeHooks === 'string' ? body.creativeHooks : undefined,
        viralCopyScriptId: body.viralCopyScriptId === null ? null : optionalString(body.viralCopyScriptId),
        viralCopyScriptVersionId: body.viralCopyScriptVersionId === null ? null : optionalString(body.viralCopyScriptVersionId),
        viralCopyScriptName: body.viralCopyScriptName === null ? null : optionalString(body.viralCopyScriptName),
        viralCopyScriptSelection: body.viralCopyScriptSelection === null ? null : optionalString(body.viralCopyScriptSelection),
        ...(body.viralCopyScriptVersionId !== undefined ? {
          viralCopyExperimentId: null,
          viralCopyExperimentAssignmentId: null,
          viralCopyExperimentArm: null,
          viralCopyExperimentOverridden: false,
          viralCopyExperimentExcluded: false,
        } : {}),
      },
      select: { id: true, caption: true, accountId: true },
    })

    if (assetIds) {
      await tx.contentAssetRef.deleteMany({ where: { draftId } })
      if (assetIds.length > 0) {
        const validAssets = (await tx.mediaAsset.findMany({ where: { id: { in: assetIds }, brandId }, select: { id: true, aiTags: true } })) as any
        const validAssetMap = new Map(validAssets.map((a: any) => [a.id, a]))
        let order = 0
        for (const assetId of assetIds) {
          const asset = validAssetMap.get(assetId) as any
          if (asset) {
            await tx.contentAssetRef.create({
              data: { draftId, assetId: asset.id, order: order++ },
            })
          }
        }
        
        // Sort asset IDs to avoid deadlocks under concurrent transactions
        const sortedAssets = [...validAssets].sort((a: any, b: any) => a.id.localeCompare(b.id))
        for (const asset of sortedAssets) {
          const assetAny = asset as any
          await tx.mediaAsset.update({
            where: { id: assetAny.id },
            data: {
              usedCount: { increment: 1 },
              lastUsedAt: new Date(),
              aiTags: assetAny.aiTags.filter((t: any) => t !== '排期发布' && t !== '草稿排期'),
            },
          })
        }
      }
    }

    if (
      coverAsset &&
      coverAsset.id !== existing.coverAssetId &&
      !(assetIds ?? []).includes(coverAsset.id)
    ) {
      await tx.mediaAsset.update({
        where: { id: coverAsset.id },
        data: {
          usedCount: { increment: 1 },
          lastUsedAt: new Date(),
          aiTags: coverAsset.aiTags.filter((tag: string) => tag !== '排期发布' && tag !== '草稿排期'),
        },
      })
    }

    if (nextStatus === 'pending_review') {
      await tx.actionItem.upsert({
        where: { draftId },
        create: {
          brandId,
          accountId: updated.accountId,
          type: 'content_approval',
          priority: 'normal',
          title: `审核草稿：${updated.caption.slice(0, 36)}`,
          description: updated.caption,
          status: 'pending',
          agentId: actor.type === 'AI_AGENT' ? actor.id : null,
          draftId,
        },
        update: {
          accountId: updated.accountId,
          title: `审核草稿：${updated.caption.slice(0, 36)}`,
          description: updated.caption,
          status: 'pending',
          resolvedAt: null,
          resolvedBy: null,
          resolvedNote: null,
        },
      })
    }

    return tx.contentDraft.findUniqueOrThrow({ where: { id: draftId }, select: DRAFT_SELECT })
  })

  void persistDraftSnapshotToObs({ brandId, draftId: draft.id, data: draft }).catch((error) => {
    console.error('[PATCH /api/brands/:id/drafts/:draftId] OBS draft snapshot failed:', error)
  })

  // Re-submit when a queued post changes schedule or Google location.
  // PostFast has no update API for either field. Strategy: delete above, then recreate.
  if ((scheduledAtChanged || gbpLocationChanged) && platformPostIdUpdate === null) {
    try {
      const { submitDraftForDelivery } = await import('@/lib/draftSubmission')
      const resubmitResult = await submitDraftForDelivery({
        brandId,
        draftId,
        actorId: actor.id,
        forcePublish: true,
        note: scheduledAtChanged && incomingScheduledAt
          ? `已更新排期时间至 ${incomingScheduledAt.toLocaleString('zh-CN', { timeZone: brand?.timezone || 'Asia/Singapore' })}`
          : '已更新 Google Business 发布门店',
      })
      if (resubmitResult.ok) {
        console.log(`[PATCH Draft] Re-submitted to PostFast with new scheduledAt ${incomingScheduledAt?.toISOString()}`)
        return NextResponse.json(
          { ok: true, draft: resubmitResult.draft, rescheduled: true, ...(resubmitResult.mode === 'queued' ? { queued: true, jobId: resubmitResult.jobId, status: resubmitResult.status } : {}) },
          { status: resubmitResult.mode === 'queued' ? 202 : 200 },
        )
      } else {
        console.warn(`[PATCH Draft] Re-submit to PostFast failed after reschedule: ${resubmitResult.error}`)
        // Return the DB-updated draft even if PostFast re-submission failed
        return NextResponse.json({ ok: true, draft, rescheduled: false, resubmitError: resubmitResult.error })
      }
    } catch (err: any) {
      console.error('[PATCH Draft] Re-submit to PostFast threw:', err)
      return NextResponse.json({ ok: true, draft, rescheduled: false, resubmitError: err?.message })
    }
  }

  return NextResponse.json({ ok: true, draft })
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeOptionalHttpUrl(value: unknown): string | null | false {
  if (value === null) return null
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : false
  } catch {
    return false
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = await prisma.contentDraft.findFirst({ where: { id: draftId, brandId } })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const activeJob = await findActivePostfastDeliveryJob(draftId)
  if (activeJob) {
    return NextResponse.json(
      { error: '大视频后台发布任务仍在进行，当前不能删除草稿。', jobId: activeJob.id, status: activeJob.status },
      { status: 409 },
    )
  }

  // If scheduled on PostFast, attempt to cancel first (non-blocking)
  // A failed cancel (e.g. post in processing/publishing state) should NOT block
  // local deletion — we log the error and clean up locally.
  if (draft.platformPostId && !draft.publishedAt) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { postfastApiKey: true }
    })
    if (brand?.postfastApiKey) {
      const { postfastDeletePost } = await import('@/lib/integrations/postfast')
      const cancelResult = await postfastDeletePost(brand.postfastApiKey, draft.platformPostId)
      if (!cancelResult.success) {
        // Log but do NOT block — PostFast may have the post in a non-cancelable state
        // (e.g. stuck publishing). We still need to clean up the local record.
        console.warn(`[draft-delete] PostFast cancel failed for ${draft.platformPostId}: ${cancelResult.error} — proceeding with local deletion anyway`)
      }
    }
  }

  // Clean up AI-generated media assets associated with this draft
  try {
    const assetRefs = await prisma.contentAssetRef.findMany({
      where: { draftId },
      include: { asset: true }
    })
    for (const ref of assetRefs) {
      const asset = ref.asset
      if (asset && (asset.sourceType === 'designer' || asset.sourceType === 'postfast' || asset.sourceType === 'huawei_obs' || asset.aiCategory === 'optimized_media' || asset.aiCategory === 'watermarked_cover')) {
        // Check if referenced by other drafts
        const otherRefs = await prisma.contentAssetRef.count({
          where: { assetId: asset.id, draftId: { not: draftId } }
        })
        if (otherRefs === 0) {
          await prisma.mediaAsset.delete({ where: { id: asset.id } })
          // Physically delete local file if any
          if (asset.url.startsWith('/uploads/')) {
            const fs = await import('fs')
            const path = await import('path')
            const localPath = path.join(process.cwd(), 'public', asset.url)
            if (fs.existsSync(localPath)) {
              fs.unlinkSync(localPath)
            }
          }
          console.log(`Deleted orphaned AI asset ${asset.id} for draft ${draftId}`)
        }
      }
    }
  } catch (err) {
    console.error(`Failed to clean up assets for deleted draft ${draftId}:`, err)
  }

  await prisma.contentDraft.delete({ where: { id: draftId } })
  return NextResponse.json({ ok: true, deleted: true, draftId })
}
