import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

const ALLOWED_MEMBER_ROLES = ['owner', 'collaborator'] as const

type MemberRole = (typeof ALLOWED_MEMBER_ROLES)[number]
type Params = { params: Promise<{ id: string; userId: string }> }

function normalizeRole(value: unknown): MemberRole | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return ALLOWED_MEMBER_ROLES.includes(normalized as MemberRole)
    ? (normalized as MemberRole)
    : null
}

async function countOwners(brandId: string): Promise<number> {
  return prisma.brandOwner.count({ where: { brandId, role: 'owner' } })
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, userId } = await params
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const role = normalizeRole(body.role)
  if (!role) {
    return NextResponse.json({ error: 'role must be owner or collaborator' }, { status: 400 })
  }

  const member = await prisma.brandOwner.findUnique({
    where: { brandId_userId: { brandId: id, userId } },
  })
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  if (member.role === 'owner' && role !== 'owner') {
    const ownerCount = await countOwners(id)
    if (ownerCount <= 1) {
      return NextResponse.json({ error: 'Brand must retain at least one owner' }, { status: 400 })
    }
  }

  const updated = await prisma.brandOwner.update({
    where: { brandId_userId: { brandId: id, userId } },
    data: { role },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          nickname: true,
          type: true,
          role: true,
        },
      },
    },
  })

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'BRAND_MEMBER_UPDATED',
      resourceId: updated.id,
      resourceType: 'BrandOwner',
      oldValue: member,
      newValue: {
        brandId: updated.brandId,
        userId: updated.userId,
        role: updated.role,
      },
    },
  })

  return NextResponse.json(updated)
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, userId } = await params
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const member = await prisma.brandOwner.findUnique({
    where: { brandId_userId: { brandId: id, userId } },
  })
  if (!member) return NextResponse.json({ error: 'Member not found' }, { status: 404 })

  if (member.role === 'owner') {
    const ownerCount = await countOwners(id)
    if (ownerCount <= 1) {
      return NextResponse.json({ error: 'Brand must retain at least one owner' }, { status: 400 })
    }
  }

  await prisma.brandOwner.delete({
    where: { brandId_userId: { brandId: id, userId } },
  })

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: 'BRAND_MEMBER_REMOVED',
      resourceId: member.id,
      resourceType: 'BrandOwner',
      oldValue: member,
    },
  })

  return NextResponse.json({ ok: true })
}
