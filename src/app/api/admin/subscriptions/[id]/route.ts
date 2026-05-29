import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAdminStatusUpdateData, type SubscriptionStatus } from '@/lib/subscription/workflow'

type Params = { params: Promise<{ id: string }> }

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.type !== 'HUMAN' || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const body = await request.json()
  const status = String(body.status ?? '') as SubscriptionStatus

  if (!['PENDING', 'ACTIVE', 'FAILED', 'CANCELLED'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const existing = await prisma.brandSubscription.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })

  const updated = await prisma.brandSubscription.update({
    where: { id },
    data: buildAdminStatusUpdateData(existing, status),
  })

  return NextResponse.json({ ok: true, subscription: updated })
}
