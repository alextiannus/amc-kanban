import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import { postfastPublish, postfastReplyReview } from '@/lib/integrations/postfast'
import { sendLarkWebhookNotification } from '@/lib/integrations/lark'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string; aid: string }> }

// PATCH /api/brands/[id]/actions/[aid]/approve
// Body: { selectedReply?: number, note?: string }
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, aid } = await params

  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findFirst({
    where: { id: brandId },
    select: {
      id: true, name: true,
      postfastApiKey: true,
      googleApiKey: true, googlePlaceId: true,
      googlePreferOAuth: true,
      googleRefreshToken: true,
      googleAccountId: true,
      googleLocationId: true,
      larkBotWebhook: true,
    },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await prisma.actionItem.findFirst({
    where: { id: aid, brandId },
    include: { draft: true, account: true },
  })
  if (!item) return NextResponse.json({ error: 'Action item not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 409 })

  const body = await request.json().catch(() => ({}))

  const updateLinkedWorkUnit = async (input: {
    status: 'in_progress' | 'pending' | 'done'
    requiredInput?: string | null
    publishedUrl?: string | null
  }) => {
    const linked = await prisma.workUnit.findFirst({
      where: { tags: { has: `action_item:${aid}` } },
      select: { id: true, materials: true },
      orderBy: { createdAt: 'desc' },
    })
    if (!linked) return

    const parts = (linked.materials ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)

    if (input.publishedUrl) {
      const existingPublishIndex = parts.findIndex((line) => line.startsWith('发布链接:'))
      const publishLine = `发布链接: ${input.publishedUrl}`
      if (existingPublishIndex >= 0) parts[existingPublishIndex] = publishLine
      else parts.push(publishLine)
    }

    await prisma.workUnit.update({
      where: { id: linked.id },
      data: {
        status: input.status,
        requiredInput: input.requiredInput ?? null,
        materials: parts.join('\n'),
      },
    })
  }

  // ── Resolve the action item ──────────────────────────────────────────────
  const resolved = await prisma.actionItem.update({
    where: { id: aid },
    data: {
      status: 'approved',
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      resolvedNote: body.note || null,
    },
  })

  await updateLinkedWorkUnit({ status: 'in_progress', requiredInput: null })

  // ── Content Approval → Publish ──────────────────────────────────
  if ((item.type === 'content_approval' || item.type === 'content_draft') && item.draft) {
    const draft = item.draft
    await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: 'publishing' } })

    const platformName = item.account?.platformId
    const isDirectGoogle = platformName === 'google' && brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId

    if ((brand.postfastApiKey && platformName) || isDirectGoogle) {
      // Fire-and-forget publish
      ;(async () => {
        let result: { success: boolean; postId?: string; url?: string; error?: string }

        if (isDirectGoogle) {
          try {
            const { getGoogleAccessToken, createGoogleGBPLocalPost } = await import('@/lib/integrations/google')
            const accessToken = await getGoogleAccessToken(brand.googleRefreshToken!)
            
            let googleAccountId = brand.googleAccountId || 'primary'
            let googleLocationId = brand.googleLocationId!
            
            if (item.account && item.account.platformId === 'google') {
              const handle = item.account.handle
              const match = handle.match(/accounts\/([^\/]+)\/locations\/([^\/]+)/)
              if (match) {
                googleAccountId = `accounts/${match[1]}`
                googleLocationId = match[2]
              } else {
                googleLocationId = handle
              }
            }

            result = await createGoogleGBPLocalPost({
              accountId: googleAccountId,
              locationId: googleLocationId,
              caption: draft.caption,
              mediaUrls: draft.mediaUrls,
              accessToken,
            })
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Direct Google GBP publish failed'
            result = { success: false, error: message }
          }
        } else {
          result = await postfastPublish({
            apiKey: brand.postfastApiKey!,
            platform: platformName!,
            caption: draft.caption,
            mediaUrls: draft.mediaUrls,
            hashtags: draft.hashtags,
            scheduledAt: draft.scheduledAt?.toISOString(),
          })
        }

        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: result.success
            ? { status: 'published', publishedAt: new Date(), platformPostId: result.postId ?? null }
            : { status: 'draft', agentNote: `发布失败: ${result.error}` },
        })

        const isScheduledFuture = !isDirectGoogle && draft.scheduledAt && new Date(draft.scheduledAt) > new Date()
        await updateLinkedWorkUnit(
          result.success
            ? { status: isScheduledFuture ? 'in_progress' : 'done', requiredInput: null, publishedUrl: result.url ?? null }
            : { status: 'pending', requiredInput: `自动发布失败：${result.error ?? 'unknown error'}。请协助排查原因。` }
        )

        // Lark notify on completion
        if (brand.larkBotWebhook) {
          sendLarkWebhookNotification({
            webhookUrl: brand.larkBotWebhook,
            title: result.success ? `✅ 内容已发布 — ${brand.name}` : `❌ 发布失败 — ${brand.name}`,
            content: result.success
              ? `帖子已成功发布到 ${platformName}。`
              : `发布失败：${result.error}`,
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard`,
          }).catch(console.error)
        }

        eventEmitter.emit('board_update')
      })()
    } else {
      // No PostFast key or direct Google configured — mark as published (manual workflow)
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date() },
      })
      const isScheduledFuture = draft.scheduledAt && new Date(draft.scheduledAt) > new Date()
      await updateLinkedWorkUnit({ status: isScheduledFuture ? 'in_progress' : 'done', requiredInput: null })
    }
  }

  // ── Sentiment Alert → Reply via PostFast (Google/Yelp) ──────────────────
  if (item.type === 'sentiment_alert' && typeof body.selectedReply === 'number') {
    const payload = item.payload && typeof item.payload === 'object'
      ? item.payload as { suggestedReplies?: unknown; reviewId?: unknown }
      : null
    const suggestedReplies = Array.isArray(payload?.suggestedReplies) ? payload.suggestedReplies : []
    const selected = suggestedReplies[body.selectedReply]
    const replyText = typeof selected === 'string' ? selected : null
    const reviewId = typeof payload?.reviewId === 'string' ? payload.reviewId : null

    if (replyText) {
      await prisma.actionItem.update({
        where: { id: aid },
        data: { resolvedNote: replyText },
      })

      if (brand.postfastApiKey && reviewId) {
        ;(async () => {
          await postfastReplyReview({
            apiKey: brand.postfastApiKey!,
            platform: 'google',
            reviewId,
            replyText,
          })
          eventEmitter.emit('board_update')
        })()
      }
    }
  }

  eventEmitter.emit('board_update')
  return NextResponse.json(resolved)
}
