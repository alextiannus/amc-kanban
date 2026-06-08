import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

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
  const userRoles = user.type === 'AI_AGENT'
    ? ['AMC_AGENT']
    : [
        ...(user.role === 'ADMIN' ? ['ADMIN'] : []),
        ...(ownerTotal > 0 ? ['BRAND_OWNER'] : []),
        ...(principalCount > 0 ? ['AMC_PRINCIPAL'] : []),
      ]

  const dashboardRole = user.role === 'ADMIN'
    ? 'ADMIN'
    : ownerTotal > 0
      ? 'BRAND_OWNER'
      : 'BRAND_DIRECTOR'

  return NextResponse.json({
    ...user,
    dashboardRole,
    userRoles,
  })
}
