import { NextResponse } from 'next/server'
import { authenticateRequest } from '@/lib/auth-v2'
import { prisma } from '@/lib/prisma'
import { getStoreEntitlements } from '@/lib/storeEntitlements'
import { StoreEntitlementError, validateManualStoreLimit } from '@/lib/storeEntitlementPolicy'

type Context = { params: Promise<{ id: string }> }

async function administrator(request: Request) {
  const principal = await authenticateRequest(request)
  if (!principal) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (principal.source !== 'session' || !principal.globalRoles.includes('ADMIN')) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { principal }
}

export async function GET(request: Request, { params }: Context) {
  const auth = await administrator(request)
  if (auth.error) return auth.error
  const { id } = await params
  if (!await prisma.brand.findUnique({ where: { id }, select: { id: true } })) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  return NextResponse.json(await getStoreEntitlements(id))
}

export async function PATCH(request: Request, { params }: Context) {
  const auth = await administrator(request)
  if (auth.error) return auth.error
  const { id } = await params
  const body = await request.json().catch(() => null)
  try {
    validateManualStoreLimit(body?.manualStoreLimit)
    const manualStoreLimit = body.manualStoreLimit as number | null
    const result = await prisma.$transaction(async (tx: any) => {
      await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${id} FOR UPDATE`
      const before = await tx.brand.findUnique({ where: { id }, select: { manualStoreLimit: true } })
      if (!before) return null
      await tx.brand.update({ where: { id }, data: { manualStoreLimit } })
      await tx.auditLog.create({ data: {
        actorId: auth.principal!.userId, actorType: auth.principal!.actorType,
        actorName: auth.principal!.email, action: 'brand.store_entitlements.update',
        resourceId: id, resourceType: 'Brand',
        oldValue: { manualStoreLimit: before.manualStoreLimit }, newValue: { manualStoreLimit },
      } })
      return getStoreEntitlements(id, tx)
    })
    return result ? NextResponse.json({ ok: true, ...result }) : NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  } catch (error) {
    if (error instanceof StoreEntitlementError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status })
    throw error
  }
}
