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
      role: true,
      nickname: true,
      avatar: true,
    }
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const [ownerCount, legacyOwnerCount] = await Promise.all([
    prisma.brandOwner.count({
      where: { userId: user.id },
    }),
    prisma.brand.count({
      where: { ownerId: user.id },
    }),
  ])

  const dashboardRole = user.role === 'ADMIN'
    ? 'ADMIN'
    : ownerCount > 0 || legacyOwnerCount > 0
      ? 'BRAND_OWNER'
      : 'BRAND_DIRECTOR'

  return NextResponse.json({
    ...user,
    dashboardRole,
  })
}
