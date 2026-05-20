import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import { postfastPublish } from '@/lib/integrations/postfast'

// Authenticate by Agent apiKey in Authorization header
async function getAgent(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace('Bearer ', '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

// POST /api/agent/action-items
// Agent pushes a new action item (diff review alert, content approval request, etc.)
// Body: { brandId, accountId?, type, priority?, title, description, payload?, draftData? }
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { brandId, accountId, type, priority, title, description, payload, draftData } = body

  if (!brandId || !type || !title || !description) {
    return NextResponse.json({ error: 'brandId, type, title, description required' }, { status: 400 })
  }

  // Verify brand exists (no ownership check — agent trusts the brand assigned to it)
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  // For content flow we require a concrete draft first so work cards can track the draft URL.
  if (type === 'content_approval' && !draftData) {
    return NextResponse.json({ error: 'draftData is required for content_approval' }, { status: 400 })
  }

  let draftId: string | undefined
  let draftUrl: string | undefined
  let workTaskId: string | undefined

  const taskPriorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
    low: 'low',
    normal: 'medium',
    medium: 'medium',
    high: 'high',
    urgent: 'urgent',
  }

  // If agent includes draft content, create the draft first
  if (draftData && type === 'content_approval') {
    const draft = await prisma.contentDraft.create({
      data: {
        brandId,
        accountId: accountId || null,
        caption: draftData.caption || '',
        captionLang: draftData.captionLang || 'en',
        mediaUrls: draftData.mediaUrls || [],
        hashtags: draftData.hashtags || [],
        scheduledAt: draftData.scheduledAt ? new Date(draftData.scheduledAt) : null,
        status: 'pending_review',
        agentId: agent.id,
        agentNote: draftData.agentNote || null,
      },
    })
    draftId = draft.id

    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const path = `/dashboard?brandId=${encodeURIComponent(brandId)}&draftId=${encodeURIComponent(draft.id)}`
    draftUrl = appBase ? `${appBase}${path}` : path

    const workTask = await prisma.workUnit.create({
      data: {
        title: `[${brand.autoPilot ? '自动驾驶' : '人工审批'}] ${title}`,
        description,
        materials: draftUrl,
        assigneeId: agent.id,
        status: brand.autoPilot ? 'in_progress' : 'pending',
        requiredInput: brand.autoPilot
          ? null
          : `请人工审核草稿并确认是否发布。草稿链接: ${draftUrl}`,
        priority: taskPriorityMap[priority || 'normal'] ?? 'medium',
        weight: 3,
      },
    })
    workTaskId = workTask.id
  }

  const item = await prisma.actionItem.create({
    data: {
      brandId,
      accountId: accountId || null,
      type,
      priority: priority || 'normal',
      title,
      description,
      payload: payload || null,
      agentId: agent.id,
      draftId: draftId || null,
      // autoPilot: if brand has autoPilot ON, immediately auto-approve
      status: brand.autoPilot ? 'auto_resolved' : 'pending',
      resolvedAt: brand.autoPilot ? new Date() : null,
      resolvedBy: brand.autoPilot ? 'auto_pilot' : null,
    },
  })

  // If brand is in autoPilot and this is content_approval — advance draft immediately
  if (brand.autoPilot && draftId) {
    const [draft, account] = await Promise.all([
      prisma.contentDraft.update({
        where: { id: draftId },
        data: { status: 'publishing' },
      }),
      accountId
        ? prisma.socialAccount.findFirst({
            where: { id: accountId, brandId },
            select: { platformId: true, handle: true },
          })
        : Promise.resolve(null),
    ])

    let publishError: string | null = null
    let publishedUrl: string | null = null

    if (!brand.postfastApiKey) {
      publishError = '自动发布失败：品牌未配置发布后端密钥'
    } else if (!account?.platformId) {
      publishError = '自动发布失败：缺少发布账号或平台信息'
    } else {
      const publish = await postfastPublish({
        apiKey: brand.postfastApiKey,
        platform: account.platformId,
        caption: draft.caption,
        mediaUrls: draft.mediaUrls,
        hashtags: draft.hashtags,
        scheduledAt: draft.scheduledAt?.toISOString(),
        accountId: accountId ?? undefined,
      })

      if (!publish.success) {
        publishError = `自动发布失败：${publish.error ?? 'unknown error'}`
      } else {
        publishedUrl = publish.url ?? null
      }

      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: publish.success
          ? { status: 'published', publishedAt: new Date(), platformPostId: publish.postId ?? null }
          : { status: 'draft', agentNote: publishError },
      })
    }

    if (workTaskId) {
      const materialParts = [draftUrl]
      if (publishedUrl) materialParts.push(`发布链接: ${publishedUrl}`)

      await prisma.workUnit.update({
        where: { id: workTaskId },
        data: publishError
          ? {
              status: 'pending',
              requiredInput: `${publishError}。请人工确认后重试发布。`,
              materials: materialParts.filter(Boolean).join('\n'),
            }
          : {
              status: 'done',
              requiredInput: null,
              materials: materialParts.filter(Boolean).join('\n'),
            },
      })
    }
  }

  // Push SSE to connected dashboard clients
  eventEmitter.emit('board_update')

  return NextResponse.json(item, { status: 201 })
}
