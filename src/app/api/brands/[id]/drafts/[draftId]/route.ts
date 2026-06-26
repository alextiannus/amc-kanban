import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'
import { parseBrandComplianceConfig, validateContentCompliance } from '@/lib/compliance'

const DRAFT_SELECT = {
  id: true,
  brandId: true,
  accountId: true,
  caption: true,
  captionLang: true,
  mediaUrls: true,
  hashtags: true,
  scheduledAt: true,
  status: true,
  agentId: true,
  agentNote: true,
  rejectionNote: true,
  platformPostId: true,
  publishedAt: true,
  creativeHooks: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, platformId: true, handle: true, displayName: true } },
  assetRefs: {
    orderBy: { order: 'asc' as const },
    include: { asset: true },
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

  let postUrl: string | undefined
  if (draft.status === 'published' && draft.platformPostId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
    if (brand?.postfastApiKey) {
      const { postfastListPosts } = await import('@/lib/integrations/postfast')
      const pfResult = await postfastListPosts(brand.postfastApiKey, { status: 'published' })
      if (pfResult.success) {
        const pfPost = pfResult.posts.find((p) => p.id === draft.platformPostId)
        if (pfPost) postUrl = pfPost.postUrl
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
    select: { id: true, status: true, platformPostId: true, publishedAt: true }
  })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  
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
        placeholderAccount = await prisma.socialAccount.create({
          data: {
            brandId,
            platformId,
            handle: 'unconfigured',
            displayName: platformId === 'google_business' ? 'Google Maps (未配置)' : '小红书 / Rednote (未配置)',
          }
        })
      }
      body.accountId = placeholderAccount.id
    }
  }

  const assetIds = Array.isArray(body.assetIds) ? normalizeStringArray(body.assetIds) : null
  const nextStatus = typeof body.status === 'string' ? body.status : undefined

  let platformPostIdUpdate: string | null | undefined = undefined
  if (existing.platformPostId && !existing.publishedAt && nextStatus && ['draft', 'pending_review', 'rejected'].includes(nextStatus)) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { postfastApiKey: true }
    })
    if (brand?.postfastApiKey) {
      const { postfastDeletePost } = await import('@/lib/integrations/postfast')
      const cancelResult = await postfastDeletePost(brand.postfastApiKey, existing.platformPostId)
      if (cancelResult.success) {
        platformPostIdUpdate = null
      } else {
        console.warn(`[PATCH Draft] Failed to cancel scheduled post on PostFast: ${cancelResult.error}`)
      }
    }
  }

  const draft = await prisma.$transaction(async (tx) => {
    const updated = await tx.contentDraft.update({
      where: { id: draftId },
      data: {
        caption: typeof body.caption === 'string' ? body.caption.trim() : undefined,
        captionLang: typeof body.captionLang === 'string' ? body.captionLang : undefined,
        accountId: typeof body.accountId === 'string' ? body.accountId : undefined,
        mediaUrls: Array.isArray(body.mediaUrls) ? normalizeStringArray(body.mediaUrls) : undefined,
        hashtags: Array.isArray(body.hashtags) ? normalizeStringArray(body.hashtags) : undefined,
        scheduledAt: typeof body.scheduledAt === 'string' ? (body.scheduledAt ? new Date(body.scheduledAt) : null) : undefined,
        status: nextStatus,
        platformPostId: platformPostIdUpdate,
        agentNote: typeof body.agentNote === 'string' ? body.agentNote : undefined,
        rejectionNote: nextStatus === 'pending_review' ? null : typeof body.rejectionNote === 'string' ? body.rejectionNote : undefined,
        creativeHooks: typeof body.creativeHooks === 'string' ? body.creativeHooks : undefined,
      },
      select: { id: true, caption: true, accountId: true },
    })

    if (assetIds) {
      await tx.contentAssetRef.deleteMany({ where: { draftId } })
      if (assetIds.length > 0) {
        const validAssets = await tx.mediaAsset.findMany({ where: { id: { in: assetIds }, brandId }, select: { id: true, aiTags: true } })
        const validAssetMap = new Map(validAssets.map(a => [a.id, a]))
        let order = 0
        for (const assetId of assetIds) {
          const asset = validAssetMap.get(assetId)
          if (asset) {
            await tx.contentAssetRef.create({
              data: { draftId, assetId: asset.id, order: order++ },
            })
          }
        }
        
        // Sort asset IDs to avoid deadlocks under concurrent transactions
        const sortedAssets = [...validAssets].sort((a, b) => a.id.localeCompare(b.id))
        for (const asset of sortedAssets) {
          await tx.mediaAsset.update({
            where: { id: asset.id },
            data: {
              usedCount: { increment: 1 },
              lastUsedAt: new Date(),
              aiTags: asset.aiTags.filter((t) => t !== '排期发布' && t !== '草稿排期'),
            },
          })
        }
      }
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

  return NextResponse.json({ ok: true, draft })
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: brandId, draftId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const draft = await prisma.contentDraft.findFirst({ where: { id: draftId, brandId } })
  if (!draft) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If scheduled, try to cancel first
  if (draft.platformPostId && !draft.publishedAt) {
    const brand = await prisma.brand.findUnique({
      where: { id: brandId },
      select: { postfastApiKey: true }
    })
    if (brand?.postfastApiKey) {
      const { postfastDeletePost } = await import('@/lib/integrations/postfast')
      const cancelResult = await postfastDeletePost(brand.postfastApiKey, draft.platformPostId)
      if (!cancelResult.success) {
        return NextResponse.json({ error: `Failed to cancel scheduled post on board backend — ${cancelResult.error}` }, { status: 400 })
      }
    }
  }

  await prisma.contentDraft.delete({ where: { id: draftId } })
  return NextResponse.json({ ok: true, deleted: true, draftId })
}
