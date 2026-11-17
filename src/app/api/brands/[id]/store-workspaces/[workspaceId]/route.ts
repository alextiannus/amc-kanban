import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string; workspaceId: string }> }
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, workspaceId } = await params
  if (!(await canWriteBrandProject(id, session.user.id)) || !(await canWriteBrandProject(workspaceId, session.user.id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const [root, workspace] = await Promise.all([
    prisma.brand.findUnique({ where: { id }, select: { id: true, parentBrandId: true } }),
    prisma.brand.findUnique({ where: { id: workspaceId } }),
  ])
  const rootId = root?.parentBrandId || root?.id
  if (!rootId || !workspace || (workspace.id !== rootId && workspace.parentBrandId !== rootId)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  const nextStatus = ['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(body.status) ? body.status : undefined
  if (nextStatus === 'PAUSED' && workspaceId === rootId) {
    const anotherActive = await prisma.brand.findFirst({ where: { parentBrandId: rootId, status: 'ACTIVE' }, select: { id: true } })
    if (!anotherActive) return NextResponse.json({ error: 'Create or activate another store workspace before pausing the brand root.' }, { status: 409 })
  }
  if (nextStatus === 'ARCHIVED') {
    const activeSubscription = await prisma.brandSubscription.findFirst({ where: { brandId: workspaceId, status: 'ACTIVE', OR: [{ contractEndDate: null }, { contractEndDate: { gt: new Date() } }] }, select: { id: true } })
    if (activeSubscription) return NextResponse.json({ error: 'Active subscription must be ended before archiving this store workspace.' }, { status: 409 })
  }
  const storeName = body.storeName !== undefined ? text(body.storeName) : workspace.storeName
  if (body.storeName !== undefined && !storeName) return NextResponse.json({ error: 'storeName is required' }, { status: 400 })
  const baseName = text(body.brandName) || workspace.name.replace(/\s*[（(][^）)]*[）)]\s*$/, '')
  const updated = await prisma.$transaction(async (tx: any) => {
    const value = await tx.brand.update({ where: { id: workspaceId }, data: {
      ...(body.storeName !== undefined ? { storeName, name: `${baseName}（${storeName}）`, workspaceKind: 'STORE' } : {}),
      ...(body.address !== undefined ? { address: text(body.address) || null } : {}),
      ...(body.phone !== undefined ? { phone: text(body.phone) || null } : {}),
      ...(body.location !== undefined ? { location: text(body.location) || null } : {}),
      ...(nextStatus ? { status: nextStatus } : {}),
    } })
    if (body.businessHours !== undefined || body.storeName !== undefined || body.address !== undefined || body.phone !== undefined) {
      await tx.brandKnowledge.upsert({ where: { brandId: workspaceId }, create: { brandId: workspaceId, businessHours: text(body.businessHours) || null, stores: [{ storeId: workspaceId, name: storeName, address: body.address !== undefined ? text(body.address) : workspace.address, phone: body.phone !== undefined ? text(body.phone) : workspace.phone, businessHours: text(body.businessHours) || null }] }, update: { ...(body.businessHours !== undefined ? { businessHours: text(body.businessHours) || null } : {}), stores: [{ storeId: workspaceId, name: storeName, address: body.address !== undefined ? text(body.address) : workspace.address, phone: body.phone !== undefined ? text(body.phone) : workspace.phone, businessHours: text(body.businessHours) || null }] } })
    }
    await tx.auditLog.create({ data: { actorId: session.user.id, actorType: 'HUMAN', actorName: session.user.email || null, action: nextStatus ? 'STORE_WORKSPACE_STATUS_CHANGED' : 'STORE_WORKSPACE_UPDATED', resourceId: workspaceId, resourceType: 'Brand', oldValue: { name: workspace.name, storeName: workspace.storeName, address: workspace.address, phone: workspace.phone, location: workspace.location, status: workspace.status }, newValue: { name: value.name, storeName: value.storeName, address: value.address, phone: value.phone, location: value.location, status: value.status }, metadata: { brandId: workspaceId, rootBrandId: rootId } } })
    return value
  })
  return NextResponse.json(updated)
}
