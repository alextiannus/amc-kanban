import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'
import { parseBrandComplianceConfig, validateContentCompliance } from '@/lib/compliance'
import { actorFromContext, writeAuditLog } from '@/lib/audit'
import { eventEmitter } from '@/lib/events'

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
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, platformId: true, handle: true, displayName: true } },
  assetRefs: {
    orderBy: { order: 'asc' as const },
    include: { asset: true },
  },
} as const

type Params = { params: Promise<{ id: string }> }

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
  const { id: brandId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const status = url.searchParams.get('status') || ''
  const q = (url.searchParams.get('q') || '').trim()

  const drafts = await prisma.contentDraft.findMany({
    where: {
      brandId,
      ...(status ? { status } : {}),
      ...(q ? {
        OR: [
          { caption: { contains: q, mode: 'insensitive' } },
          { hashtags: { has: q } },
        ],
      } : {}),
    },
    select: DRAFT_SELECT,
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })

  // Dynamically resolve postUrl for published drafts
  const hasPublishedDrafts = drafts.some((d) => d.status === 'published' && d.platformPostId)
  let resolvedDrafts = drafts.map((d) => ({ ...d, postUrl: undefined as string | undefined }))

  if (hasPublishedDrafts) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
    if (brand?.postfastApiKey) {
      const { postfastListPosts } = await import('@/lib/integrations/postfast')
      const pfResult = await postfastListPosts(brand.postfastApiKey, { status: 'published' })
      if (pfResult.success) {
        resolvedDrafts = drafts.map((d) => {
          if (d.status === 'published' && d.platformPostId) {
            const pfPost = pfResult.posts.find((p) => p.id === d.platformPostId)
            return { ...d, postUrl: pfPost?.postUrl }
          }
          return { ...d, postUrl: undefined }
        })
      }
    }
  }

  return NextResponse.json({ drafts: resolvedDrafts })
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const caption = typeof body.caption === 'string' ? body.caption.trim() : ''
  if (!caption) return NextResponse.json({ error: 'caption is required' }, { status: 400 })

  // Run compliance checks on caption before creating draft
  const complianceConfig = await parseBrandComplianceConfig(brandId)
  if (complianceConfig) {
    const validation = validateContentCompliance(caption, complianceConfig)
    if (!validation.isValid) {
      return NextResponse.json(
        { error: `内容包含品牌违禁词: ${validation.matchedProhibitedWords.join(', ')}，请调整后重新提交。` },
        { status: 400 }
      )
    }
  }

  const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : ''
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })

  const assetIds = normalizeStringArray(body.assetIds)
  const status = typeof body.status === 'string' ? body.status : 'draft'
  const scheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt ? new Date(body.scheduledAt) : null

  let newTask: any = null

  const draft = await prisma.$transaction(async (tx) => {
    const created = await tx.contentDraft.create({
      data: {
        brandId,
        accountId,
        caption,
        captionLang: typeof body.captionLang === 'string' && body.captionLang ? body.captionLang : 'en',
        mediaUrls: normalizeStringArray(body.mediaUrls),
        hashtags: normalizeStringArray(body.hashtags),
        scheduledAt,
        status,
        agentId: actor.type === 'AI_AGENT' ? actor.id : typeof body.agentId === 'string' ? body.agentId : null,
        agentNote: typeof body.agentNote === 'string' ? body.agentNote : null,
      },
      select: { id: true },
    })

    if (assetIds.length > 0) {
      const validAssets = await tx.mediaAsset.findMany({
        where: { id: { in: assetIds }, brandId },
        select: { id: true, aiTags: true },
      })
      const validAssetMap = new Map(validAssets.map(a => [a.id, a]))
      let order = 0
      for (const assetId of assetIds) {
        const asset = validAssetMap.get(assetId)
        if (asset) {
          await tx.contentAssetRef.create({
            data: { draftId: created.id, assetId: asset.id, order: order++ },
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

    if (status === 'pending_review') {
      await tx.actionItem.create({
        data: {
          brandId,
          accountId: typeof body.accountId === 'string' && body.accountId ? body.accountId : null,
          type: 'content_approval',
          priority: 'normal',
          title: `审核草稿：${caption.slice(0, 36)}`,
          description: caption,
          status: 'pending',
          agentId: actor.type === 'AI_AGENT' ? actor.id : null,
          draftId: created.id,
        },
      })
    }

    if (body.createTask === true) {
      const brandAgent = await tx.brandAgent.findFirst({
        where: { brandId, active: true },
        select: { agentId: true },
      })

      const account = await tx.socialAccount.findUnique({
        where: { id: accountId },
        select: { platformId: true },
      })

      const platformName = account
        ? account.platformId.toLowerCase() === 'instagram' ? 'Instagram'
          : account.platformId.toLowerCase() === 'xiaohongshu' ? '小红书'
          : account.platformId.toLowerCase() === 'facebook' ? 'Facebook'
          : account.platformId.toLowerCase() === 'tiktok' ? 'TikTok'
          : account.platformId
        : '社媒'

      const taskTitle = `【${platformName}排期发布】由 AMC Copywriter 继续完成文案创作与发布`
      const taskDescription = `基于素材库提交的排期草稿，由平台的 AMC Copywriter 继续完成内容的完整创作（正文、Hashtags）与排期发布。\n\n草稿 ID: ${created.id}\n初始文案: ${caption}`

      newTask = await tx.workUnit.create({
        data: {
          title: taskTitle,
          description: taskDescription,
          status: 'todo',
          brandId,
          assigneeId: brandAgent?.agentId || null,
          tags: [account?.platformId || 'social', 'copywriter'],
          priority: 'medium',
          deadline: scheduledAt,
        },
      })
    }

    return tx.contentDraft.findUniqueOrThrow({ where: { id: created.id }, select: DRAFT_SELECT })
  })

  if (newTask) {
    const session = await getSession()
    const apiKey = extractApiKey(request)
    const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

    await writeAuditLog({
      actor: actorFromContext(session?.user, authenticatedAgent),
      action: 'TASK_CREATED',
      resourceId: newTask.id,
      newValue: newTask,
      metadata: { source: apiKey ? 'api' : 'web' }
    })

    eventEmitter.emit('board_update')
  }

  void persistDraftSnapshotToObs({ brandId, draftId: draft.id, data: draft }).catch((error) => {
    console.error('[POST /api/brands/:id/drafts] OBS draft snapshot failed:', error)
  })

  return NextResponse.json({ ok: true, draft }, { status: 201 })
}
