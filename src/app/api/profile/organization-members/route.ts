import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

const ALLOWED_ROLES = ['member', 'manager'] as const

type OrganizationRole = (typeof ALLOWED_ROLES)[number]

function normalizeRole(input: unknown): OrganizationRole {
  if (typeof input !== 'string') return 'member'
  const value = input.trim().toLowerCase()
  return ALLOWED_ROLES.includes(value as OrganizationRole) ? (value as OrganizationRole) : 'member'
}

export async function GET() {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const members = await prisma.organizationMember.findMany({
    where: { ownerId: session.user.id },
    orderBy: { createdAt: 'asc' },
    include: {
      member: {
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          type: true,
        },
      },
    },
  })

  return NextResponse.json(members)
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const role = normalizeRole(body.role)

  if (!email) {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }

  const member = await prisma.user.findUnique({
    where: { email },
    select: { id: true, type: true, email: true },
  })

  if (!member || member.type !== 'HUMAN') {
    return NextResponse.json({ error: 'Organization member must be a HUMAN user' }, { status: 400 })
  }

  if (member.id === session.user.id) {
    return NextResponse.json({ error: 'Cannot add yourself as organization member' }, { status: 400 })
  }

  const existing = await prisma.organizationMember.findUnique({
    where: {
      ownerId_memberId: {
        ownerId: session.user.id,
        memberId: member.id,
      },
    },
  })

  const record = await prisma.organizationMember.upsert({
    where: {
      ownerId_memberId: {
        ownerId: session.user.id,
        memberId: member.id,
      },
    },
    create: {
      ownerId: session.user.id,
      memberId: member.id,
      role,
    },
    update: {
      role,
    },
    include: {
      member: {
        select: {
          id: true,
          email: true,
          nickname: true,
          role: true,
          type: true,
        },
      },
    },
  })

  await prisma.auditLog.create({
    data: {
      actorId: session.user.id,
      actorType: 'HUMAN',
      actorName: session.user.email || null,
      action: existing ? 'ORGANIZATION_MEMBER_UPDATED' : 'ORGANIZATION_MEMBER_ADDED',
      resourceId: record.id,
      resourceType: 'OrganizationMember',
      oldValue: existing || undefined,
      newValue: {
        ownerId: record.ownerId,
        memberId: record.memberId,
        role: record.role,
      },
    },
  })

  return NextResponse.json(record, { status: existing ? 200 : 201 })
}
