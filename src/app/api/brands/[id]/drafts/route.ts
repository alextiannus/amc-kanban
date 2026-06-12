import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { persistDraftSnapshotToObs } from '@/lib/integrations/huaweiObs'

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

  return NextResponse.json({ drafts })
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const actor = await ensureAccess(request, brandId)
  if (!actor) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const caption = typeof body.caption === 'string' ? body.caption.trim() : ''
  if (!caption) return NextResponse.json({ error: 'caption is required' }, { status: 400 })

  const accountId = typeof body.accountId === 'string' && body.accountId ? body.accountId : ''
  if (!accountId) return NextResponse.json({ error: 'accountId is required' }, { status: 400 })

  const assetIds = normalizeStringArray(body.assetIds)
  const status = typeof body.status === 'string' ? body.status : 'draft'
  const scheduledAt = typeof body.scheduledAt === 'string' && body.scheduledAt ? new Date(body.scheduledAt) : null

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
        select: { id: true },
      })
      await Promise.all(validAssets.map((asset, index) => tx.contentAssetRef.create({
        data: { draftId: created.id, assetId: asset.id, order: index },
      })))
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

    return tx.contentDraft.findUniqueOrThrow({ where: { id: created.id }, select: DRAFT_SELECT })
  })

  void persistDraftSnapshotToObs({ brandId, draftId: draft.id, data: draft }).catch((error) => {
    console.error('[POST /api/brands/:id/drafts] OBS draft snapshot failed:', error)
  })

  return NextResponse.json({ ok: true, draft }, { status: 201 })
}
