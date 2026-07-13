import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { eventEmitter } from '@/lib/events'
import { postfastPublish, postfastReplyReview } from '@/lib/integrations/postfast'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { getSchedulingRecommendations } from '@/lib/schedulingRecommendation'

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
          assetRefs: { orderBy: { order: 'asc' }, include: { asset: true } }
        }
      },
      account: true,
    },
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
      .map((line: any) => line.trim())
      .filter(Boolean)

    if (input.publishedUrl) {
      const existingPublishIndex = parts.findIndex((line: any) => line.startsWith('发布链接:'))
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
        let result: { success: boolean; postId?: string; url?: string; error?: string } = { success: false, error: 'Unknown' }
        let resolvedScheduledAt = draft.scheduledAt ? new Date(draft.scheduledAt) : null

        const combinedMediaUrls = Array.from(new Set([
          ...(draft.mediaUrls || []),
          ...(draft.assetRefs || []).map((ref: any) => ref.asset.url),
        ].filter(Boolean)))

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
              mediaUrls: combinedMediaUrls,
              accessToken,
            })
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'Direct Google GBP publish failed'
            result = { success: false, error: message }
          }
        } else {
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
              mediaUrls: combinedMediaUrls,
              hashtags: draft.hashtags,
              scheduledAt: resolvedScheduledAt?.toISOString(),
            })
          }
        }

        // Ensure subsequent status decision uses the final, resolved schedule time.
        if (!result.success) {
          resolvedScheduledAt = null
        }

        const isScheduled = !isDirectGoogle && !!resolvedScheduledAt && resolvedScheduledAt > new Date()

        await prisma.contentDraft.update({
          where: { id: draft.id },
          data: result.success
            ? {
                status: isScheduled ? 'scheduled' : 'published',
                publishedAt: isScheduled ? null : new Date(),
                platformPostId: result.postId ?? null,
                postUrl: isScheduled ? null : (result.url ?? null),
                scheduledAt: resolvedScheduledAt,
              }
            : { status: result.error?.includes('取消') ? 'failed' : 'draft', agentNote: `发布失败: ${result.error}` },
        })

        const isScheduledFutureForWorkUnit = !isDirectGoogle && !!resolvedScheduledAt && resolvedScheduledAt > new Date()
        await updateLinkedWorkUnit(
          result.success
            ? { status: isScheduledFutureForWorkUnit ? 'in_progress' : 'done', requiredInput: null, publishedUrl: result.url ?? null }
            : { status: 'pending', requiredInput: `自动发布失败：${result.error ?? 'unknown error'}。请协助排查原因。` }
        )



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
  const resolved = await prisma.actionItem.findUnique({ where: { id: aid } })
  return NextResponse.json(resolved)
}
