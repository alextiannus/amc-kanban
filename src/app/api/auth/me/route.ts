import { readPolicies } from '@/lib/role-permissions/store'
import { effectiveGrants } from '@/lib/role-permissions/contract'
import { authenticateCurrentSession } from '@/lib/auth-v2'
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

  const principal = await authenticateCurrentSession()
  if (!principal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const snapshot = await readPolicies()
  const assigned = principal.permissionRoleIds || principal.globalRoles
  const permissionRoles = snapshot.roles.filter(role => assigned.includes(role.id))
  const effectiveRoleIds = permissionRoles.filter(role => role.enabled).map(role => role.id)
  const permissions = effectiveGrants(effectiveRoleIds, snapshot.policies)
  return NextResponse.json({
    ...user,
    status: undefined,
    authVersion: undefined,
    businessRoles: undefined,
    dashboardRole,
    userRoles: principal.globalRoles,
    permissions, permissionRoles, effectiveRoleIds,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
