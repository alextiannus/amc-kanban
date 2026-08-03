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
  postUrl: true,
  publishedAt: true,
  deliveryFailureCode: true,
  deliveryFailureAt: true,
  creativeHooks: true,
  createdAt: true,
  updatedAt: true,
  account: { select: { id: true, platformId: true, handle: true, displayName: true } },
  assetRefs: {
    orderBy: { order: 'asc' as const },
    include: { asset: true },
  },
} as const

const DRAFT_STATUSES = new Set([
  'draft',
  'pending_review',
  'approved',
  'scheduled',
  'publishing',
  'published',
  'rejected',
  'failed',
  'archived',
])

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
  if (status && !DRAFT_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid draft status' }, { status: 400 })
  }

  const [drafts, groupedCounts] = await prisma.$transaction([
    prisma.contentDraft.findMany({
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
    }),
    prisma.contentDraft.groupBy({
      by: ['status'],
      where: { brandId },
      _count: { _all: true },
    }),
  ])
  const countRows = groupedCounts as Array<{ status: string; _count: { _all: number } }>
  const counts = Object.fromEntries(
    countRows.map((item) => [item.status, item._count._all]),
  )
  counts.all = countRows.reduce((sum, item) => sum + item._count._all, 0)

  // Dynamically resolve postUrl for published drafts that don't have it in the database
  const needsUrlResolution = drafts.some((d: any) => d.status === 'published' && d.platformPostId && !d.postUrl)
  let resolvedDrafts = drafts.map((d: any) => ({ ...d, postUrl: d.postUrl ?? undefined as string | undefined }))

  if (needsUrlResolution) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { postfastApiKey: true } })
    if (brand?.postfastApiKey) {
      const { postfastListPosts } = await import('@/lib/integrations/postfast')
      const pfResult = await postfastListPosts(brand.postfastApiKey, { status: 'published' })
      if (pfResult.success) {
        // Build resolved drafts and collect cache updates
        const urlsToCache: { id: string; postUrl: string }[] = []
        resolvedDrafts = drafts.map((d: any) => {
          if (d.status === 'published' && d.platformPostId) {
            if (d.postUrl) return { ...d, postUrl: d.postUrl }
            const pfPost = pfResult.posts.find((p: any) => p.id === d.platformPostId)
            const resolvedUrl = pfPost?.postUrl
            if (resolvedUrl) urlsToCache.push({ id: d.id, postUrl: resolvedUrl })
            return { ...d, postUrl: resolvedUrl }
          }
          return { ...d, postUrl: undefined }
        })
        // Batch-cache resolved URLs in a single transaction (fire & forget)
        if (urlsToCache.length > 0) {
          prisma.$transaction(
            urlsToCache.map(({ id, postUrl }) =>
              prisma.contentDraft.update({ where: { id }, data: { postUrl } })
            )
          ).catch((err: any) => console.error('Failed to batch-cache draft postUrls:', err))
        }
      }
    }
  }


  return NextResponse.json({ drafts: resolvedDrafts, counts })
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

  let accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : ''
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })

  if (accountId.startsWith('unconfigured_')) {
    const platformId = accountId.replace('unconfigured_', '')
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
    accountId = placeholderAccount.id
  }

  const assetIds = normalizeStringArray(body.assetIds)
  const status = typeof body.status === 'string' ? body.status : 'draft'
  const scheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt ? new Date(body.scheduledAt) : null

  let newTask: any = null

  const draft = await prisma.$transaction(async (tx: any) => {
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
        creativeHooks: typeof body.creativeHooks === 'string' ? body.creativeHooks : null,
      },
      select: { id: true },
    })

    if (assetIds.length > 0) {
      const validAssets = (await tx.mediaAsset.findMany({
        where: { id: { in: assetIds }, brandId },
        select: { id: true, aiTags: true },
      })) as any
      const validAssetMap = new Map(validAssets.map((a: any) => [a.id, a]))
      let order = 0
      for (const assetId of assetIds) {
        const asset = validAssetMap.get(assetId) as any
        if (asset) {
          await tx.contentAssetRef.create({
            data: { draftId: created.id, assetId: asset.id, order: order++ },
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
          : ['google_maps', 'google_business', 'google'].includes(account.platformId.toLowerCase()) ? 'Google Business'
          : account.platformId
        : '社媒'

      const taskTitle = `【${platformName}排期发布】由 AMC Copywriter 继续完成文案创作与发布`
      const taskDescription = `基于素材库提交的排期草稿，由平台的 AMC Copywriter 继续完成内容的完整创作（正文、Hashtags）与排期发布。\n\n草稿 ID: ${created.id}\n初始文案: ${caption}${body.creativeHooks ? `\n创意 hooks: ${body.creativeHooks}` : ''}`

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
