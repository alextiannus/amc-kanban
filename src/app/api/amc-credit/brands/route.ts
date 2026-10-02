import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { resolveSessionOrApiKey } from '@/lib/user-management/auth'
import { listCreditOverview, updateCreditSettings } from '@/lib/amc-credit/service'

async function accessibleBrandIds(user: { id: string; role: string }) {
  if (isAmcOperator(user)) return undefined
  const rows = await prisma.brand.findMany({ where: { status: 'ACTIVE', OR: [
    { ownerId: user.id },
    { owners: { some: { userId: user.id } } },
    { crew: { members: { some: { userId: user.id, active: true } } } },
  ] }, select: { id: true } })
  return rows.map(row => row.id)
}

export async function GET(request: Request) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json({ rows: await listCreditOverview(await accessibleBrandIds(auth.user)), canManage: isAmcOperator(auth.user) })
}

export async function PATCH(request: Request) {
  const auth = await resolveSessionOrApiKey(request)
  if (!auth?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAmcOperator(auth.user)) return NextResponse.json({ error: 'System admin required' }, { status: 403 })
  const body = await request.json().catch(() => null) as any
  if (!body || typeof body.brandId !== 'string') return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  try {
    const before = await prisma.amcCreditAccount.findUnique({ where: { brandId: body.brandId } })
    const account = await updateCreditSettings({ brandId: body.brandId, planId: body.planId, cycleAllowance: body.cycleAllowance,
      allowOverage: typeof body.allowOverage === 'boolean' ? body.allowOverage : undefined,
      allowNightlyOverage: typeof body.allowNightlyOverage === 'boolean' ? body.allowNightlyOverage : undefined, actorId: auth.user.id })
    await prisma.auditLog.create({ data: { actorId: auth.user.id, actorType: 'HUMAN', actorName: auth.user.email, action: 'AMC_CREDIT_SETTINGS_UPDATED', resourceId: body.brandId, resourceType: 'Brand', oldValue: before ? JSON.parse(JSON.stringify(before)) : undefined, newValue: JSON.parse(JSON.stringify(account)), reason: typeof body.reason === 'string' ? body.reason.slice(0, 300) : null } })
    return NextResponse.json({ ok: true, account })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Unable to update AMC Credit settings' }, { status: error.status || 400 })
  }
}
