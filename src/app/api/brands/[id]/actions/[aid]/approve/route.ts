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

  // ── Content Approval → PostFast Publish ──────────────────────────────────
  if (item.type === 'content_approval' && item.draft) {
    const draft = item.draft
    await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: 'publishing' } })

    if (brand.postfastApiKey && item.account?.platformId) {
      // Fire-and-forget PostFast publish
      ;(async () => {
        const result = await postfastPublish({
          apiKey: brand.postfastApiKey!,
          platform: item.account!.platformId,
          caption: draft.caption,
          mediaUrls: draft.mediaUrls,
          hashtags: draft.hashtags,
          scheduledAt: draft.scheduledAt?.toISOString(),
        })

        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: result.success
            ? { status: 'published', publishedAt: new Date(), platformPostId: result.postId ?? null }
            : { status: 'draft', agentNote: `发布失败: ${result.error}` },
        })

        await updateLinkedWorkUnit(
          result.success
            ? { status: 'done', requiredInput: null, publishedUrl: result.url ?? null }
            : { status: 'pending', requiredInput: `自动发布失败：${result.error ?? 'unknown error'}。请人工复核并重试。` }
        )

        // Lark notify on completion
        if (brand.larkBotWebhook) {
          sendLarkWebhookNotification({
            webhookUrl: brand.larkBotWebhook,
            title: result.success ? `✅ 内容已发布 — ${brand.name}` : `❌ 发布失败 — ${brand.name}`,
            content: result.success
              ? `帖子已成功发布到 ${item.account!.platformId}。`
              : `发布失败：${result.error}`,
            actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard`,
          }).catch(console.error)
        }

        eventEmitter.emit('board_update')
      })()
    } else {
      // No PostFast key configured — mark as published (manual workflow)
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date() },
      })
      await updateLinkedWorkUnit({ status: 'done', requiredInput: null })
    }
  }

  // ── Sentiment Alert → Reply via PostFast (Google/Yelp) ──────────────────
  if (item.type === 'sentiment_alert' && typeof body.selectedReply === 'number') {
    const payload = item.payload as any
    const replyText = payload?.suggestedReplies?.[body.selectedReply]
    const reviewId = payload?.reviewId

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
