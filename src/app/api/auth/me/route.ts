import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { prisma } from '@/lib/prisma'
import { sessionCookieName, verifySessionToken } from '@/lib/auth-v2'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '@/lib/userRoles'

export async function GET() {
  const token = (await cookies()).get(sessionCookieName)?.value
  const claims = token ? await verifySessionToken(token) : null
  if (!claims) {
    const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    res.cookies.delete(sessionCookieName)
    return res
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
      locale: true,
      businessRoles: { select: { role: true } },
    }
  })

  if (
    !user ||
    user.status !== 'ACTIVE' ||
    (claims.authVersion > 0 && claims.authVersion !== user.authVersion)
  ) {
    const res = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    res.cookies.delete(sessionCookieName)
    return res
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
