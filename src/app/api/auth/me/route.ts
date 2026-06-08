import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '@/lib/userRoles'

export async function GET() {
  const session = await getSession()
  if (!session || !session.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      email: true,
      type: true,
      role: true,
      nickname: true,
      avatar: true,
      businessRoles: { select: { role: true } },
    }
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const [ownerCount, legacyOwnerCount, principalCount] = await Promise.all([
    prisma.brandOwner.count({
      where: { userId: user.id },
    }),
    prisma.brand.count({
      where: { ownerId: user.id },
    }),
    prisma.agentPermission.count({
      where: { humanId: user.id },
    }),
  ])

  const ownerTotal = ownerCount + legacyOwnerCount
  const userRoles = computeEffectiveUserRoles({
    userType: user.type,
    systemRole: user.role,
    explicitRoles: user.businessRoles.map((role) => role.role),
    ownerCount: ownerTotal,
    principalCount,
  })
  const dashboardRole = getLegacyDashboardRole(userRoles)

  return NextResponse.json({
    ...user,
    businessRoles: undefined,
    dashboardRole,
    userRoles,
  })
}
