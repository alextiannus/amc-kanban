import { principalFromUser, type PrincipalUserRecord, type AuthPrincipal } from '../auth-v2/types.ts'
import { computeEffectiveUserRoles, getLegacyDashboardRole } from '../userRoles.ts'
import { resolveRoles } from '../permissions.ts'
import { hasCapability } from '../auth-v2/capabilities.ts'
import type { BrandOption, Context, Overview } from './types.ts'
import type { Prisma } from '@prisma/client'

type Membership = { role: string; source: string; crew: { brand: { id: string; name: string } } }
type ScopeUser = { id: string; crewMemberships: Membership[]; organizationsJoined: { ownerId: string; owner: { crewMemberships: Membership[] } }[] }
export function collectBrandSources(users: ScopeUser[]): BrandOption[] {
  const brands = new Map<string, BrandOption>()
  function add(member: Membership, source: string) {
    const brand = member.crew.brand
    const item = brands.get(brand.id) || { id: brand.id, name: brand.name, sources: [] }
    item.sources.push(`${source} · ${member.role} · ${member.source}`)
    brands.set(brand.id, item)
  }
  for (const user of users) {
    for (const member of user.crewMemberships) add(member, `直接 Crew (${user.id})`)
    for (const organization of user.organizationsJoined) for (const member of organization.owner.crewMemberships) add(member, `组织继承 (${organization.ownerId})`)
  }
  return Array.from(brands.values()).sort((a, b) => a.name.localeCompare(b.name))
}
// Structural dependency injection permits read-only tests without loading Prisma or Next.
export type UserReader = {
  user: { findUnique: (args: Prisma.UserFindUniqueArgs) => Promise<unknown>; findMany: (args: Prisma.UserFindManyArgs) => Promise<unknown[]> }
  brand: { findMany: (args: Prisma.BrandFindManyArgs) => Promise<{ id: string; name: string }[]>; findUnique: (args: Prisma.BrandFindUniqueArgs) => Promise<{ id: string } | null> }
}
export async function loadUserOverview(db: UserReader, id: string, selectedBrandId: string | undefined,
  canAccessBrand: (principal: AuthPrincipal, brandId: string) => Promise<boolean>) {
  const user = await db.user.findUnique({ where: { id }, select: {
    id: true, email: true, nickname: true, type: true, role: true, status: true, authVersion: true, ownerId: true,
    businessRoles: { select: { role: true } }, owner: { select: { id: true, role: true, businessRoles: { select: { role: true } } } },
  } }) as (PrincipalUserRecord & { nickname: string | null }) | null
  if (!user) return null
  const principal = principalFromUser(user, 'session')
  const explicitMenuRoles = computeEffectiveUserRoles({ userType: user.type, systemRole: user.role, explicitRoles: user.businessRoles.map(role => role.role) })
  const menuRoles = resolveRoles({ role: user.role, userRoles: explicitMenuRoles, dashboardRole: getLegacyDashboardRole(explicitMenuRoles) })
  const active = user.status === 'ACTIVE'
  const membershipSelect = { role: true, source: true, crew: { select: { brand: { select: { id: true, name: true } } } } }
  let brands: BrandOption[] = []
  if (active) {
    if (principal.globalRoles.includes('ADMIN')) {
      brands = (await db.brand.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } })).map(brand => ({ ...brand, sources: ['ADMIN 全局品牌范围'] }))
    } else {
      const scopeUsers = await db.user.findMany({ where: { id: { in: [user.id, principal.linkedHumanUserId || ''] }, status: 'ACTIVE' }, select: {
        id: true, crewMemberships: { where: { active: true }, select: membershipSelect },
        organizationsJoined: { select: { ownerId: true, owner: { select: { crewMemberships: { where: { active: true }, select: membershipSelect } } } } },
      } })
      brands = collectBrandSources(scopeUsers as ScopeUser[])
    }
  }
  let brandScope: Context['brandScope'] = 'unselected'
  if (selectedBrandId) {
    const exists = await db.brand.findUnique({ where: { id: selectedBrandId }, select: { id: true } })
    brandScope = active && exists && await canAccessBrand(principal, selectedBrandId) ? 'allowed' : 'denied'
  }
  const roleSources = ['菜单与服务端均使用 principalFromUser 当前角色；操作来源见各项权限']
  if (!user.businessRoles.length) roleSources.push('无显式角色；不会从默认看板角色推导权限。')
  if (principal.linkedHumanUserId) roleSources.push(`服务端还会合并关联账号角色：${principal.linkedHumanUserId}`)
  const detail: NonNullable<Overview['user']> = { id: user.id, email: user.email, nickname: user.nickname, status: user.status, roles: principal.globalRoles, assignedRoleIds: principal.permissionRoleIds || principal.globalRoles, menuRoles: principal.globalRoles, roleSources }
  return { context: { roles: principal.globalRoles, permissionRoleIds: principal.permissionRoleIds, menuRoles: principal.globalRoles, accountRoles: explicitMenuRoles, active, brandScope } satisfies Context, user: detail, brands, selectedBrandId }
}
