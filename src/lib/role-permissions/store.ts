import { prisma } from '../prisma.ts'
import { defaultGrants, effectiveGrants, POLICY_ROLES, validateGrants } from './contract.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
import type { Prisma } from '@prisma/client'

export async function readPolicies(db = prisma) {
  const rows = await db.rolePermissionPolicy.findMany()
  const policies = Object.fromEntries(POLICY_ROLES.map(role => [role, defaultGrants(role)]))
  const versions: Record<string, number> = Object.fromEntries(POLICY_ROLES.map(role => [role, 0]))
  for (const row of rows) {
    // Invalid persisted policies fail closed instead of restoring legacy grants.
    policies[row.role] = validateGrants(row.grants)
    versions[row.role] = row.version
  }
  return { policies, versions }
}
export async function grantsFor(principal: Pick<AuthPrincipal, 'globalRoles'>) {
  const { policies } = await readPolicies()
  return effectiveGrants(principal.globalRoles, policies)
}
export async function allows(principal: Pick<AuthPrincipal, 'globalRoles'>, key: string) {
  if (principal.globalRoles.includes('ADMIN')) return true
  return (await grantsFor(principal)).includes(key)
}
export class PolicyError extends Error { constructor(message: string, public status: number) { super(message) } }
export async function savePolicy(actor: AuthPrincipal, role: string, input: { grants?: unknown; expectedVersion?: unknown }, db = prisma) {
  if (actor.source !== 'session' || !actor.globalRoles.includes('ADMIN')) throw new PolicyError('Forbidden', 403)
  if (!(POLICY_ROLES as readonly string[]).includes(role)) throw new PolicyError('该角色不能修改', 400)
  let grants: string[]
  try { grants = validateGrants(input.grants) } catch (e) { throw new PolicyError((e as Error).message, 400) }
  if (!Number.isSafeInteger(input.expectedVersion) || Number(input.expectedVersion) < 0) throw new PolicyError('缺少有效策略版本', 400)
  try {
    return await db.$transaction(async (tx: Prisma.TransactionClient) => {
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
