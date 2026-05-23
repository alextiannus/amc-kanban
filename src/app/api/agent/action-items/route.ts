import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import { postfastPublish } from '@/lib/integrations/postfast'

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

// Authenticate by Agent apiKey in Authorization header
async function getAgent(request: Request) {
  const auth = request.headers.get('authorization') || ''
  const key = auth.replace('Bearer ', '').trim()
  if (!key) return null
  return prisma.user.findFirst({ where: { apiKey: key, type: 'AI_AGENT' } })
}

// POST /api/agent/action-items
// Agent pushes a new action item (diff review alert, content approval request, etc.)
// Body: { brandId, accountId?, type, priority?, title, description, payload?, draftUrl?, draftData? }
// For content_approval: Agent can either pass draftUrl (Lark doc link) or draftData (to create internal draft)
export async function POST(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { brandId, accountId: explicitAccountId, type, priority, title, description, payload, draftUrl: incomingDraftUrl, draftData } = body

  // platform can be passed at top-level OR inside draftData — AI just needs to know the name (e.g. "instagram")
  const platformHint: string | undefined = body.platform || draftData?.platform

  if (!brandId || !type || !title || !description) {
    return NextResponse.json({ error: 'brandId, type, title, description required' }, { status: 400 })
  }

  // Verify brand exists (no ownership check — agent trusts the brand assigned to it)
  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const isContentApproval = type === 'content_approval' || type === 'content_draft'

  // For content flow: if draftUrl is provided by Agent (e.g., Lark doc), use it directly.
  // Otherwise, if draftData is provided, create an internal ContentDraft and WorkUnit.
  if (isContentApproval && !incomingDraftUrl && !draftData) {
    return NextResponse.json({ error: 'draftUrl or draftData is required for content approval action items' }, { status: 400 })
  }
  if (incomingDraftUrl && !isValidHttpUrl(incomingDraftUrl)) {
    return NextResponse.json({ error: 'draftUrl must be a valid http/https URL' }, { status: 400 })
  }

  let draftId: string | undefined
  let draftUrl: string = incomingDraftUrl || ''
  let workTaskId: string | undefined
  // Resolve accountId: explicit > auto-lookup by platform
  let accountId: string | undefined = explicitAccountId || undefined
  if (!accountId && platformHint) {
    const found = await prisma.socialAccount.findFirst({
      where: { brandId, platformId: { equals: platformHint, mode: 'insensitive' } },
      select: { id: true },
    })
    if (found) accountId = found.id
  }

  const taskPriorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
    low: 'low',
    normal: 'medium',
    medium: 'medium',
    high: 'high',
    urgent: 'urgent',
  }

  // If agent includes draft content (draftData), create the draft first
  if (draftData && isContentApproval) {
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
  }

  // Create WorkUnit to track this content work (with draft URL and eventual post URL)
  if (isContentApproval && draftUrl) {
    const draftMaterial = `草稿链接: ${draftUrl}`
    const workTask = await prisma.workUnit.create({
      data: {
        title: `[${brand.autoPilot ? '自动驾驶' : '人工审批'}] ${title}`,
        description,
        materials: draftMaterial,
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

  // If brand is in autoPilot and it is a content approval item with draftData,
  // we create the action item as 'pending' initially and only mark it as 'auto_resolved'
  // after successful PostFast publishing. For non-content approval alerts (like competitor_alert),
  // we can resolve immediately if autoPilot is enabled.
  const shouldAutoResolveImmediately = brand.autoPilot && !isContentApproval
  const initialStatus = shouldAutoResolveImmediately ? 'auto_resolved' : 'pending'

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
      status: initialStatus,
      resolvedAt: shouldAutoResolveImmediately ? new Date() : null,
      resolvedBy: shouldAutoResolveImmediately ? 'auto_pilot' : null,
    },
  })

  // Link the work card to this action item for deterministic callback updates.
  if (workTaskId) {
    await prisma.workUnit.update({
      where: { id: workTaskId },
      data: {
        tags: { push: `action_item:${item.id}` },
      },
    })
  }

  // If brand is in autoPilot and this is content approval with draft — attempt immediate publish
  if (brand.autoPilot && isContentApproval && workTaskId) {
    // If we have draftId, we created an internal draft; attempt to publish it
    if (draftId) {
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

      // Resolve the platform name: from linked account or from draftData hint
      const platformName: string | undefined =
        account?.platformId ?? platformHint ?? draftData?.platform

      if (!brand.postfastApiKey) {
        publishError = '自动发布失败：品牌未配置发布后端密钥（postfastApiKey）'
      } else if (!platformName) {
        publishError = '自动发布失败：未指定发布平台，请在 draftData.platform 传入平台名（如 instagram）'
      } else {
        const publish = await postfastPublish({
          apiKey: brand.postfastApiKey,
          platform: platformName,
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

        if (publish.success) {
          await Promise.all([
            prisma.contentDraft.update({
              where: { id: draft.id },
              data: { status: 'published', publishedAt: new Date(), platformPostId: publish.postId ?? null },
            }),
            prisma.actionItem.update({
              where: { id: item.id },
              data: {
                status: 'auto_resolved',
                resolvedAt: new Date(),
                resolvedBy: 'auto_pilot',
              },
            }),
          ])
        } else {
          await Promise.all([
            prisma.contentDraft.update({
              where: { id: draft.id },
              data: { status: 'draft', agentNote: publishError },
            }),
            prisma.actionItem.update({
              where: { id: item.id },
              data: {
                status: 'pending',
                resolvedNote: publishError,
              },
            }),
          ])
        }
      }

      const materialParts = [`草稿链接: ${draftUrl}`]
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
    } else {
      // Agent provided draftUrl directly (e.g., Lark doc). Keep it in_progress
      // until the final published URL is callback-ed to the board.
      await prisma.workUnit.update({
        where: { id: workTaskId },
        data: {
          status: 'in_progress',
          requiredInput: null,
        },
      })
    }
  }

  // Push SSE to connected dashboard clients
  eventEmitter.emit('board_update')

  return NextResponse.json(item, { status: 201 })
}

// PATCH /api/agent/action-items
// Agent reports publishing result: actionItemId + postUrl to update WorkUnit
// Body: { actionItemId, postUrl }
export async function PATCH(request: Request) {
  const agent = await getAgent(request)
  if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { actionItemId, postUrl } = body

  if (!actionItemId || !postUrl) {
    return NextResponse.json({ error: 'actionItemId and postUrl required' }, { status: 400 })
  }
  if (!isValidHttpUrl(postUrl)) {
    return NextResponse.json({ error: 'postUrl must be a valid http/https URL' }, { status: 400 })
  }

  // Find the action item and associated work unit
  const actionItem = await prisma.actionItem.findUnique({
    where: { id: actionItemId },
    select: { id: true, agentId: true, type: true },
  })

  if (!actionItem) {
    return NextResponse.json({ error: 'Action item not found' }, { status: 404 })
  }

  if (actionItem.agentId !== agent.id) {
    return NextResponse.json({ error: 'Not authorized to update this action item' }, { status: 403 })
  }

  // Find the associated WorkUnit by deterministic tag.
  const workUnits = await prisma.workUnit.findMany({
    where: {
      assigneeId: agent.id,
      tags: { has: `action_item:${actionItemId}` },
    },
    orderBy: { createdAt: 'desc' },
    take: 1,
  })

  if (workUnits.length === 0) {
    // Backward-compatible fallback for old tasks created before action_item tag rollout.
    const fallback = await prisma.workUnit.findMany({
      where: {
        assigneeId: agent.id,
        status: { in: ['pending', 'in_progress'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 1,
    })
    if (fallback.length === 0) {
      return NextResponse.json({ error: 'No pending work unit found for this action item' }, { status: 404 })
    }
    workUnits.push(fallback[0])
  }

  const workUnit = workUnits[0]
  const currentMaterials = workUnit.materials || ''
  const materialParts = currentMaterials.split('\n').filter(Boolean)

  // Add post URL if not already present
  if (!materialParts.find((part) => part.startsWith('发布链接:'))) {
    materialParts.push(`发布链接: ${postUrl}`)
  }

  // Update WorkUnit to mark as done
  const updated = await prisma.workUnit.update({
    where: { id: workUnit.id },
    data: {
      status: 'done',
      requiredInput: null,
      materials: materialParts.join('\n'),
    },
  })

  eventEmitter.emit('board_update')

  return NextResponse.json({ ok: true, workUnitId: updated.id })
}
