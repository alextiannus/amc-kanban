import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

const clean = (value: unknown, max: number) => typeof value === 'string'
  ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max)
  : ''

export async function POST(request: Request, { params }: Params) {
  const principal = await authenticateRequest(request)
  if (!principal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: brandId } = await params
  const role = principal.globalRoles.includes('ADMIN') ? 'ADMIN' : 'USER'
  if (!(await canSessionAccessBrandProject(brandId, principal.userId, 'HUMAN', role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const action = clean(body.action, 40)
  const subscription = await prisma.brandSubscription.findFirst({
    where: { brandId, status: 'ACTIVE' },
    orderBy: { createdAt: 'desc' },
  })
  if (!subscription) return NextResponse.json({ error: 'No active subscription found.' }, { status: 404 })

  if (action === 'schedule_cancel') {
    if (!subscription.contractEndDate) {
      return NextResponse.json({ error: 'The subscription has no contract end date. Please contact support.' }, { status: 409 })
    }
    const updated = await prisma.brandSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: true, cancellationRequestedAt: subscription.cancellationRequestedAt || new Date() },
    })
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: true, contractEnd: updated.contractEndDate?.toISOString() })
  }

  if (action === 'resume') {
    await prisma.brandSubscription.update({
      where: { id: subscription.id },
      data: { cancelAtPeriodEnd: false, cancellationRequestedAt: null },
    })
    return NextResponse.json({ ok: true, cancelAtPeriodEnd: false })
  }

  if (action === 'request_invoice') {
    const companyName = clean(body.companyName, 200)
    const uen = clean(body.uen, 32).toUpperCase()
    if (!companyName || !uen) return NextResponse.json({ error: 'Company name and UEN are required.' }, { status: 400 })
    if (!/^[A-Z0-9][A-Z0-9 .()&'\/-]{3,31}$/.test(uen)) {
      return NextResponse.json({ error: 'Please enter a valid UEN.' }, { status: 400 })
    }
    const invoiceRequest = await prisma.subscriptionInvoiceRequest.create({
      data: { subscriptionId: subscription.id, brandId, requestedById: principal.userId, companyName, uen },
      select: { id: true, status: true, createdAt: true },
    })
    return NextResponse.json({ ok: true, invoiceRequest }, { status: 201 })
  }

  return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
}
