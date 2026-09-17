import { prisma } from '../prisma.ts'
import { defaultGrants, effectiveGrants, validateGrants } from './contract.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
import type { Prisma } from '@prisma/client'

export async function readPolicies(db = prisma) {
  const roles: Prisma.RoleDefinitionGetPayload<{ include: { policy: true; _count: { select: { members: true } } } }>[] = await db.roleDefinition.findMany({ include: { policy: true, _count: { select: { members: true } } }, orderBy: [{ builtIn: 'desc' }, { createdAt: 'asc' }] })
  const policies: Record<string, string[]> = {}, configuredPolicies: Record<string, string[]> = {}, versions: Record<string, number> = {}
  for (const role of roles) {
    const grants = role.policy ? validateGrants(role.policy.grants) : role.builtIn ? defaultGrants(role.id) : []
    configuredPolicies[role.id] = grants
    policies[role.id] = role.enabled ? grants : []
    versions[role.id] = role.policy?.version || 0
  }
  return { policies, configuredPolicies, versions, roles: roles.map(({ policy, _count, normalizedName, ...role }) => ({ ...role, memberCount: _count.members })) }
}
export async function grantsFor(principal: Pick<AuthPrincipal, 'globalRoles' | 'permissionRoleIds'>) {
  const { policies } = await readPolicies()
  return effectiveGrants(principal.globalRoles.includes('ADMIN') ? ['ADMIN'] : (principal.permissionRoleIds || principal.globalRoles).filter(id => Object.hasOwn(policies, id)), policies)
}
export async function allows(principal: Pick<AuthPrincipal, 'globalRoles' | 'permissionRoleIds'>, key: string) {
  if (principal.globalRoles.includes('ADMIN')) return true
  return (await grantsFor(principal)).includes(key)
}
export class PolicyError extends Error { constructor(message: string, public status: number) { super(message) } }
export async function savePolicy(actor: AuthPrincipal, role: string, input: { grants?: unknown; expectedVersion?: unknown }, db = prisma) {
  if (actor.source !== 'session' || !actor.globalRoles.includes('ADMIN')) throw new PolicyError('Forbidden', 403)
  if (role === 'ADMIN') throw new PolicyError('该角色不能修改', 400)
  let grants: string[]
  try { grants = validateGrants(input.grants) } catch (e) { throw new PolicyError((e as Error).message, 400) }
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) throw new PolicyError('缺少有效策略版本', 400)
  try {
    return await db.$transaction(async (tx: Prisma.TransactionClient) => {
      if (!await tx.roleDefinition.findUnique({ where: { id: role } })) throw new PolicyError('该角色不存在', 404)
      const previous = await tx.rolePermissionPolicy.findUnique({ where: { role } })
      const version = previous?.version || 0
      if (version !== input.expectedVersion) throw new PolicyError('权限已被其他管理员修改，请刷新后重试', 409)
      if (previous) {
        const updated = await tx.rolePermissionPolicy.updateMany({ where: { role, version }, data: { grants, version: { increment: 1 }, updatedById: actor.userId } })
        if (updated.count !== 1) throw new PolicyError('权限版本冲突', 409)
      } else await tx.rolePermissionPolicy.create({ data: { role, grants, version: 1, updatedById: actor.userId } })
      await tx.auditLog.create({ data: { actorId: actor.userId, actorType: actor.actorType, action: 'role_permissions.update', resourceType: 'RolePermissionPolicy', resourceId: role, oldValue: { grants: previous?.grants || defaultGrants(role), version }, newValue: { grants, version: version + 1 } } })
      const affectedUsers = await tx.user.count({ where: { OR: [{ businessRoles: { some: { role } } }, { owner: { businessRoles: { some: { role } } } }] } })
      return { role, grants, version: version + 1, affectedUsers }
    })
  } catch (e) {
    if ((e as {code?: string}).code === 'P2002') throw new PolicyError('权限版本冲突，请刷新', 409)
    throw e
  }
}
