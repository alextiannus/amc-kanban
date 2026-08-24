import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { submitDraftForDelivery } from '@/lib/draftSubmission'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; draftId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id: brandId, draftId } = await params
    const actor = await getActor(request)
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // ── Trial expiry gate ──────────────────────────────────────────────────
    // If the brand's subscription is still PENDING and the 5-day trial has
    // expired, block publishing until payment is confirmed by admin.
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
      actorId: actor.id,
      note: typeof body.note === 'string' ? body.note : null,
      immediatePublish: body.publishType === 'immediate',
      confirmedUnknownResult: actor.type === 'HUMAN' && body.confirmedUnknownResult === true,
    })

    if (!result.ok) return NextResponse.json(result, { status: result.status })
    return NextResponse.json(result)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : '排期通道发生未预期错误'
    console.error('[draft submit] submitDraftForDelivery failed:', error)
    return NextResponse.json({ error: `排期通道异常：${message}` }, { status: 500 })
  }
}

