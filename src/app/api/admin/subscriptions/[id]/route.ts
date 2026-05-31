import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { buildAdminStatusUpdateData, type SubscriptionStatus } from '@/lib/subscription/workflow'
import { ensureBrandAgentKeyAfterSubscription } from '@/lib/subscription/service'

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

  if (existing.status !== 'ACTIVE' && updated.status === 'ACTIVE') {
    let ownerId = updated.createdById || null
    if (!ownerId) {
      const [ownerLink, legacyBrand] = await Promise.all([
        prisma.brandOwner.findFirst({ where: { brandId: updated.brandId }, select: { userId: true }, orderBy: { createdAt: 'asc' } }),
        prisma.brand.findUnique({ where: { id: updated.brandId }, select: { ownerId: true } }),
      ])
      ownerId = ownerLink?.userId || legacyBrand?.ownerId || null
    }

    if (ownerId) {
      await ensureBrandAgentKeyAfterSubscription({
        brandId: updated.brandId,
        ownerId,
      })
    }
  }

  return NextResponse.json({ ok: true, subscription: updated })
}
