import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'

const ALLOWED_MEMBER_ROLES = ['owner', 'collaborator'] as const

type MemberRole = (typeof ALLOWED_MEMBER_ROLES)[number]
type Params = { params: Promise<{ id: string }> }

function normalizeRole(value: unknown): MemberRole {
  if (typeof value !== 'string') return 'collaborator'
  const normalized = value.trim().toLowerCase()
  return ALLOWED_MEMBER_ROLES.includes(normalized as MemberRole)
    ? (normalized as MemberRole)
    : 'collaborator'
}

export async function GET(_request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const members = await prisma.brandOwner.findMany({
    where: { brandId: id },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
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

  return NextResponse.json(members)
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canHumanAccessBrandProject(id, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  let userId = typeof body.userId === 'string' ? body.userId.trim() : ''
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!userId && !email) {
    return NextResponse.json({ error: 'userId or email is required' }, { status: 400 })
  }

  const role = normalizeRole(body.role)

  if (!userId && email) {
    const resolved = await prisma.user.findUnique({
      where: { email },
      select: { id: true, type: true },
    })
    if (!resolved) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    userId = resolved.id
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, type: true },
  })
  if (!user || user.type !== 'HUMAN') {
    return NextResponse.json({ error: 'Only HUMAN users can be brand members' }, { status: 400 })
  }

  const existing = await prisma.brandOwner.findUnique({
    where: { brandId_userId: { brandId: id, userId } },
  })

  const member = await prisma.brandOwner.upsert({
    where: { brandId_userId: { brandId: id, userId } },
    create: {
      brandId: id,
      userId,
      role,
    },
    update: {
      role,
    },
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
      action: existing ? 'BRAND_MEMBER_UPDATED' : 'BRAND_MEMBER_ADDED',
      resourceId: member.id,
      resourceType: 'BrandOwner',
      oldValue: existing || undefined,
      newValue: {
        brandId: member.brandId,
        userId: member.userId,
        role: member.role,
      },
    },
  })

  return NextResponse.json(member, { status: existing ? 200 : 201 })
}
