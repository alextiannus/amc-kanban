import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { submitDraftForDelivery } from '@/lib/draftSubmission'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; draftId: string }> }

async function handleApprove(request: Request, { params }: Params) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id: brandId, draftId } = await params
    const ok = await canWriteBrandProject(brandId, session.user.id)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── Trial expiry gate ──────────────────────────────────────────────────
    const subscription = await prisma.brandSubscription.findFirst({
      where: { brandId, status: { not: 'CANCELLED' } },
      orderBy: { createdAt: 'desc' },
      select: { status: true, trialEndsAt: true },
    })
    if (
      subscription?.status === 'PENDING' &&
      subscription.trialEndsAt &&
      new Date() > subscription.trialEndsAt
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

    const body = await request.json().catch(() => ({}))
    const result = await submitDraftForDelivery({
      brandId,
      draftId,
      actorId: session.user.id,
      forcePublish: true,
      note: typeof body.note === 'string' ? body.note.trim() || null : null,
      immediatePublish: body.publishType === 'immediate',
      confirmedUnknownResult: body.confirmedUnknownResult === true,
    })

    if (!result.ok) return NextResponse.json(result, { status: result.status })
    return NextResponse.json(result, { status: result.mode === 'queued' ? 202 : 200 })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '排期通道发生未预期错误'
    console.error('[draft approve] submitDraftForDelivery failed:', error)
    return NextResponse.json({ error: `排期通道异常：${message}` }, { status: 500 })
  }
}

export const POST = handleApprove
export const PATCH = handleApprove

