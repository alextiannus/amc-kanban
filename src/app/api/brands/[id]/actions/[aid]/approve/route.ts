import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import {
  postfastPublish,
  postfastReplyReview,
  type PostFastPublishResult,
} from '@/lib/integrations/postfast'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'
import { buildPostfastMediaItems } from '@/lib/publishMedia'
import {
  blockingMediaIssues,
  mediaValidationResponse,
  mediaValidationStatus,
} from '@/lib/mediaValidation'
import { validateDraftMediaForPlatform } from '@/lib/publishMediaValidation'

/** Fetch smart schedule recommendation — mirrors the helper in draftSubmission.ts */
async function fetchRecommendedScheduleTime(brandId: string, platform: string): Promise<Date | null> {
  try {
    const data = await getSchedulingRecommendations({
      brandId,
      platform,
      urgency: 'normal',
    })
    const iso = data.recommendations?.[0]?.recommendedAt
    return iso ? new Date(iso) : null
  } catch {
    return null
  }
}

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
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } }
        }
      },
      account: true,
    },
  })
  if (!item) return NextResponse.json({ error: 'Action item not found' }, { status: 404 })
  if (item.status !== 'pending') return NextResponse.json({ error: 'Already resolved' }, { status: 409 })

  const body = await request.json().catch(() => ({}))

  const isContentApproval = (item.type === 'content_approval' || item.type === 'content_draft') && item.draft
  const approvalPlatform = item.account?.platformId || item.draft?.account?.platformId
  if (isContentApproval && brand.postfastApiKey && approvalPlatform) {
    try {
      const issues = await validateDraftMediaForPlatform({
        platform: approvalPlatform,
        mediaUrls: item.draft!.mediaUrls,
        assetRefs: item.draft!.assetRefs,
      })
      const blockingIssues = blockingMediaIssues(issues)
      if (blockingIssues.length > 0) {
        return NextResponse.json(
          {
            code: 'MEDIA_VALIDATION_FAILED',
            error: '素材不符合发布要求',
            issues: blockingIssues,
          },
          { status: 422 },
        )
      }
    } catch (error) {
      return NextResponse.json(mediaValidationResponse(error), { status: mediaValidationStatus(error) })
    }
  }

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
    await prisma.contentDraft.update({ where: { id: draft.id }, data: { status: 'publishing' } })

    const platformName = item.account?.platformId || draft.account?.platformId

    if (brand.postfastApiKey && platformName) {
      // Fire-and-forget publish
      ;(async () => {
        let result: PostFastPublishResult = { success: false, error: 'Unknown' }
        let resolvedScheduledAt = draft.scheduledAt ? new Date(draft.scheduledAt) : null

        const mediaItems = buildPostfastMediaItems({
          mediaUrls: draft.mediaUrls,
          assetRefs: draft.assetRefs,
        })

        let canProceed = true
        if (draft.platformPostId && !draft.publishedAt) {
          const { postfastDeletePost } = await import('@/lib/integrations/postfast')
          const cancelResult = await postfastDeletePost(brand.postfastApiKey!, draft.platformPostId)
          if (!cancelResult.success) {
            const isNotFound = cancelResult.error?.includes('404') ||
              cancelResult.error?.toLowerCase().includes('not found') ||
              cancelResult.error?.includes('does not exist')
            if (isNotFound) {
              console.warn(`[approve route] Old post ${draft.platformPostId} not found in PostFast, clearing`)
              await prisma.contentDraft.update({
                where: { id: draft.id },
                data: { platformPostId: null },
              })
            } else {
              canProceed = false
              result = { success: false, error: `无法取消旧排期。${cancelResult.error || ''}` }
            }
          } else {
            await prisma.contentDraft.update({
              where: { id: draft.id },
              data: { platformPostId: null },
            })
          }
        }

        if (canProceed) {
          // Auto-schedule: if no scheduledAt on this draft, get recommended time first
          const isRescheduleRequested = typeof body.note === 'string' &&
            (body.note.includes('重新智能排期') || body.note.includes('智能重新排期'))

          if (!resolvedScheduledAt || isRescheduleRequested) {
            const recommended = await fetchRecommendedScheduleTime(brandId, platformName!)
            if (recommended) {
              resolvedScheduledAt = recommended
              // Write back to DB so the calendar reflects the new time
              await prisma.contentDraft.update({
                where: { id: draft.id },
                data: { scheduledAt: resolvedScheduledAt },
              })
            }
          }

          result = await postfastPublish({
            apiKey: brand.postfastApiKey!,
            platform: platformName!,
            caption: draft.caption,
            mediaItems,
            hashtags: draft.hashtags,
            scheduledAt: resolvedScheduledAt?.toISOString(),
          })
        }

        // Ensure subsequent status decision uses the final, resolved schedule time.
        if (!result.success) {
          resolvedScheduledAt = null
        }

        const isScheduled = !!resolvedScheduledAt && resolvedScheduledAt > new Date()
        const transientFailure = result.code === 'MEDIA_VALIDATION_FAILED'
          || result.code === 'MEDIA_INSPECTION_UNAVAILABLE'
          || result.code === 'POSTFAST_PUBLISH_TIMEOUT'

        await Promise.all([
          prisma.contentDraft.update({
            where: { id: draft.id },
            data: result.success
              ? {
                  status: isScheduled ? 'scheduled' : 'published',
                  publishedAt: isScheduled ? null : new Date(),
                  platformPostId: result.postId ?? null,
                  postUrl: isScheduled ? null : (result.url ?? null),
                  scheduledAt: resolvedScheduledAt,
                }
              : transientFailure
                ? { status: draft.status }
                : { status: result.error?.includes('取消') ? 'failed' : 'draft', agentNote: `发布失败: ${result.error}` },
          }),
          ...(transientFailure
            ? [prisma.actionItem.update({
                where: { id: item.id },
                data: {
                  status: 'pending',
                  resolvedAt: null,
                  resolvedBy: null,
                  resolvedNote: result.error ?? null,
                },
              })]
            : []),
        ])

        eventEmitter.emit('board_update')
      })()
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
