import { readPolicies } from '@/lib/role-permissions/store'
import { effectiveGrants } from '@/lib/role-permissions/contract'
import { authenticateCurrentRequest } from '@/lib/auth-v2'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '@/lib/userRoles'

export async function GET() {
  const principal = await authenticateCurrentRequest()
  if (!principal) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } })

  const user = await prisma.user.findUnique({
    where: { id: principal.userId },
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

  if (!user || user.status !== 'ACTIVE') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userRoles = computeEffectiveUserRoles({
    userType: user.type,
    systemRole: user.role,
    explicitRoles: user.businessRoles.map((role: any) => role.role),
  })
  const dashboardRole = getLegacyDashboardRole(userRoles)

  const snapshot = await readPolicies()
  const assigned = principal.permissionRoleIds || principal.globalRoles
  const permissionRoles = snapshot.roles.filter(role => assigned.includes(role.id))
  const effectiveRoleIds = permissionRoles.filter(role => role.enabled).map(role => role.id)
  const permissions = effectiveGrants(effectiveRoleIds, snapshot.policies)
  return NextResponse.json({
    ...user,
    role: principal.globalRoles.includes('ADMIN') ? 'ADMIN' : 'USER',
    authSource: principal.source,
    status: undefined,
    authVersion: undefined,
    businessRoles: undefined,
    dashboardRole,
    userRoles: principal.globalRoles,
    permissions, permissionRoles, effectiveRoleIds,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
