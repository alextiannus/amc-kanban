import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { sessionCookieName, verifySessionToken } from '@/lib/auth-v2'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '@/lib/userRoles'

export async function GET() {
  const token = (await cookies()).get(sessionCookieName)?.value
  const claims = token ? await verifySessionToken(token) : null
  if (!claims) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await prisma.user.findUnique({
    where: { id: claims.sub },
    select: {
      id: true,
      email: true,
      type: true,
      role: true,
      status: true,
      authVersion: true,
      nickname: true,
      avatar: true,
      businessRoles: { select: { role: true } },
    }
  })

  if (
    !user ||
    user.status !== 'ACTIVE' ||
    (claims.authVersion > 0 && claims.authVersion !== user.authVersion)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userRoles = computeEffectiveUserRoles({
    userType: user.type,
    systemRole: user.role,
    explicitRoles: user.businessRoles.map((role: any) => role.role),
  })
  const dashboardRole = getLegacyDashboardRole(userRoles)

  return NextResponse.json({
    ...user,
    status: undefined,
    authVersion: undefined,
    businessRoles: undefined,
    dashboardRole,
    userRoles,
  })
}
