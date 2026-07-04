import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import { postfastPublish } from '@/lib/integrations/postfast'
import { authenticateRequest, requireCapability } from '@/lib/auth-v2'

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
  const principal = await authenticateRequest(request)
  return principal?.actorType === 'AMC_AGENT' ? principal : null
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

  const brand = await prisma.brand.findUnique({ where: { id: brandId } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  try {
    await requireCapability(agent, 'action_item.create', { brandId })
  } catch {
    return NextResponse.json({ error: 'Brand not linked to this agent' }, { status: 403 })
  }

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
  // Resolve accountId: explicit > auto-lookup by platform
  let accountId: string | undefined = explicitAccountId || undefined
  if (!accountId && platformHint) {
    const found = await prisma.socialAccount.findFirst({
      where: { brandId, platformId: { equals: platformHint, mode: 'insensitive' } },
      select: { id: true },
    })
    if (found) accountId = found.id
  }

  // If agent includes draft content (draftData), create the draft first
  if (draftData && isContentApproval) {
    const caption = typeof draftData.caption === 'string' ? draftData.caption.trim() : ''
    if (!caption) {
      return NextResponse.json({ error: 'draftData.caption is required and cannot be empty' }, { status: 400 })
    }
    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required for content approval drafts' }, { status: 400 })
    }

    const draft = await prisma.contentDraft.create({
      data: {
        brandId,
        accountId: accountId || null,
        caption,
        captionLang: draftData.captionLang || 'en',
        mediaUrls: draftData.mediaUrls || [],
        hashtags: draftData.hashtags || [],
        // scheduledAt intentionally set to null here — time must be determined by the
        // scheduling/recommend API to avoid conflicts. Agents should call
        // board_get_schedule_recommendation before board_submit_draft.
        scheduledAt: null,
        status: 'pending_review',
        agentId: agent.userId,
        agentNote: draftData.agentNote || null,
        creativeHooks: draftData.creativeHooks || null,
      },
    })
    draftId = draft.id

    const appBase = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const path = `/dashboard?brandId=${encodeURIComponent(brandId)}&draftId=${encodeURIComponent(draft.id)}`
    draftUrl = appBase ? `${appBase}${path}` : path
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
      agentId: agent.userId,
      draftId: draftId || null,
      status: initialStatus,
      resolvedAt: shouldAutoResolveImmediately ? new Date() : null,
      resolvedBy: shouldAutoResolveImmediately ? 'auto_pilot' : null,
    },
  })

  // If brand is in autoPilot and this is content approval with draft — attempt immediate publish
  if (brand.autoPilot && isContentApproval) {
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
      let platformPostId: string | null = null

      // Resolve the platform name: from linked account or from draftData hint
      const platformName: string | undefined =
        account?.platformId ?? platformHint ?? draftData?.platform

      const isDirectGoogle = platformName === 'google' && brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId

      if (!isDirectGoogle && !brand.postfastApiKey) {
        publishError = '自动发布失败：品牌未配置发布后端密钥（postfastApiKey）'
      } else if (!platformName) {
        publishError = '自动发布失败：未指定发布平台，请在 draftData.platform 传入平台名（如 instagram）'
      } else {
        let publish: { success: boolean; postId?: string; url?: string; error?: string }

        if (isDirectGoogle) {
          try {
            const { getGoogleAccessToken, createGoogleGBPLocalPost } = await import('@/lib/integrations/google')
            const accessToken = await getGoogleAccessToken(brand.googleRefreshToken!)
            
            let googleAccountId = brand.googleAccountId || 'primary'
            let googleLocationId = brand.googleLocationId!
            
            if (account && account.platformId === 'google') {
              const handle = account.handle
              const match = handle.match(/accounts\/([^\/]+)\/locations\/([^\/]+)/)
              if (match) {
                googleAccountId = `accounts/${match[1]}`
                googleLocationId = match[2]
              } else {
                googleLocationId = handle
              }
            }

            publish = await createGoogleGBPLocalPost({
              accountId: googleAccountId,
              locationId: googleLocationId,
              caption: draft.caption,
              mediaUrls: draft.mediaUrls,
              accessToken,
            })
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Direct Google GBP publish failed'
            publish = { success: false, error: message }
          }
        } else {
          publish = await postfastPublish({
            apiKey: brand.postfastApiKey!,
            platform: platformName,
            caption: draft.caption,
            mediaUrls: draft.mediaUrls,
            hashtags: draft.hashtags,
            scheduledAt: draft.scheduledAt?.toISOString(),
            accountId: accountId ?? undefined,
          })
        }

        if (!publish.success) {
          publishError = `自动发布失败：${publish.error ?? 'unknown error'}`
        } else {
          publishedUrl = publish.url ?? null
          platformPostId = publish.postId ?? null
        }

        if (publish.success) {
          await Promise.all([
            prisma.contentDraft.update({
              where: { id: draft.id },
              data: { status: 'published', publishedAt: new Date(), platformPostId, postUrl: publishedUrl },
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

    }
  }

  // Push SSE to connected dashboard clients
  eventEmitter.emit('board_update')

  return NextResponse.json(item, { status: 201 })
}

// PATCH /api/agent/action-items
// Agent reports publishing result: actionItemId + postUrl.
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

  const actionItem = await prisma.actionItem.findUnique({
    where: { id: actionItemId },
    select: { id: true, agentId: true, type: true, brandId: true, draftId: true },
  })

  if (!actionItem) {
    return NextResponse.json({ error: 'Action item not found' }, { status: 404 })
  }

  if (actionItem.agentId !== agent.userId) {
    return NextResponse.json({ error: 'Not authorized to update this action item' }, { status: 403 })
  }
  try {
    await requireCapability(agent, 'action_item.resolve', { brandId: actionItem.brandId })
  } catch {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.actionItem.update({
      where: { id: actionItem.id },
      data: {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: agent.userId,
        resolvedNote: `Published: ${postUrl}`,
      },
    })
    if (actionItem.draftId) {
      await tx.contentDraft.update({
        where: { id: actionItem.draftId },
        data: { status: 'published', postUrl, publishedAt: new Date() },
      })
    }
  })

  eventEmitter.emit('board_update')

  return NextResponse.json({ ok: true, actionItemId: actionItem.id })
}
