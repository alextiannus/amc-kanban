import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import { postfastReplyReview } from '@/lib/integrations/postfast'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { submitDraftForDelivery } from '@/lib/draftSubmission'
import { findActivePostfastDeliveryJob } from '@/lib/postfastDelivery'

type Params = { params: Promise<{ id: string; aid: string }> }

// PATCH /api/brands/[id]/actions/[aid]/approve
// Body: { selectedReply?: number, note?: string }
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, aid } = await params

  if (!(await canWriteBrandProject(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // ── Trial expiry gate ──────────────────────────────────────────────────
  const activeSub = await prisma.brandSubscription.findFirst({
    where: { brandId, status: { not: 'CANCELLED' } },
    orderBy: { createdAt: 'desc' },
    select: { status: true, trialEndsAt: true },
  })
  if (
    activeSub?.status === 'PENDING' &&
    activeSub.trialEndsAt &&
    new Date() > activeSub.trialEndsAt
  ) {
    return NextResponse.json(
      {
        error: 'TRIAL_EXPIRED',
        message: '试用期已结束，请完成付款后方可继续发布内容。如有疑问请联系您的运营顾问。',
      },
      { status: 403 }
    )
  }
  // ── End trial expiry gate ──────────────────────────────────────────────

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
    },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const item = await prisma.actionItem.findFirst({
    where: { id: aid, brandId },
    include: {
      draft: {
        include: {
          account: true,
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } },
          coverAsset: true,
        }
      },
      account: true,
    },
  })
  if (!item) return NextResponse.json({ error: 'Action item not found' }, { status: 404 })
  if (item.status !== 'pending') {
    const activeJob = item.draft ? await findActivePostfastDeliveryJob(item.draft.id) : null
    if (activeJob) {
      return NextResponse.json({ ...item, queued: true, jobId: activeJob.id, deliveryStatus: activeJob.status }, { status: 202 })
    }
    return NextResponse.json({ error: 'Already resolved' }, { status: 409 })
  }

  const body = await request.json().catch(() => ({}))

  // ── Resolve the action item ──────────────────────────────────────────────
  const resolveResult = await prisma.actionItem.updateMany({
    where: { id: aid, brandId, status: 'pending' },
    data: {
      status: 'approved',
      resolvedAt: new Date(),
      resolvedBy: session.user.id,
      resolvedNote: body.note || null,
    },
  })
  if (resolveResult.count === 0) {
    return NextResponse.json({ error: 'Already resolved' }, { status: 409 })
  }

  // ── Content Approval → Publish ──────────────────────────────────
  if ((item.type === 'content_approval' || item.type === 'content_draft') && item.draft) {
    const draft = item.draft
    const platformName = item.account?.platformId || draft.account?.platformId
    if (brand.postfastApiKey && platformName) {
      const delivery = await submitDraftForDelivery({
        brandId,
        draftId: draft.id,
        actorId: session.user.id,
        forcePublish: true,
        note: typeof body.note === 'string' ? body.note : null,
      })
      if (!delivery.ok) {
        await prisma.actionItem.update({
          where: { id: item.id },
          data: {
            status: 'pending',
            resolvedAt: null,
            resolvedBy: null,
            resolvedNote: delivery.error,
          },
        })
        return NextResponse.json(delivery, { status: delivery.status })
      }
      if (delivery.mode === 'queued') {
        await prisma.actionItem.update({
          where: { id: item.id },
          data: {
            status: 'pending',
            resolvedAt: null,
            resolvedBy: null,
            resolvedNote: '大视频已进入后台发布队列',
          },
        })
      }
      eventEmitter.emit('board_update')
      const resolved = await prisma.actionItem.findUnique({ where: { id: aid } })
      return NextResponse.json(
        { ...resolved, delivery, ...(delivery.mode === 'queued' ? { queued: true, jobId: delivery.jobId } : {}) },
        { status: delivery.mode === 'queued' ? 202 : 200 },
      )
    } else {
      // No PostFast key or direct Google configured — mark as published (manual workflow)
      await prisma.contentDraft.update({
        where: { id: draft.id },
        data: { status: 'published', publishedAt: new Date() },
      })
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
  const resolved = await prisma.actionItem.findUnique({ where: { id: aid } })
  return NextResponse.json(resolved)
}
