import { randomUUID } from 'node:crypto'
import { prisma } from '../prisma.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
import { PolicyError } from './store.ts'
import { defaultGrants, validateGrants } from './contract.ts'
import type { Prisma } from '@prisma/client'
export function requireRoleAdmin(actor: AuthPrincipal) {
  if (actor.source !== 'session' || !actor.globalRoles.includes('ADMIN')) throw new PolicyError('Forbidden', 403)
}
export function roleName(value: unknown) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 60) throw new PolicyError('角色名称需要 1–60 个字符', 400)
  const name = value.trim(), normalizedName = name.normalize('NFKC').toLowerCase()
  if (['admin','amc_principal','brand_owner','researcher','system','系统管理员'].includes(normalizedName)) throw new PolicyError('不能使用系统保留名称', 400)
  return { name, normalizedName }
}
function description(value: unknown) {
  if (value === undefined) return ''
  if (typeof value !== 'string' || value.length > 500) throw new PolicyError('角色说明最多 500 个字符', 400)
  return value.trim()
}
async function audit(tx: Prisma.TransactionClient, actor: AuthPrincipal, action: string, id: string, oldValue: object, newValue: object) {
  await tx.auditLog.create({ data: { actorId: actor.userId, actorType: actor.actorType, action, resourceType: 'RoleDefinition', resourceId: id, oldValue: JSON.parse(JSON.stringify(oldValue)) as Prisma.InputJsonValue, newValue: JSON.parse(JSON.stringify(newValue)) as Prisma.InputJsonValue } })
}
export async function createRole(actor: AuthPrincipal, input: { name?: unknown; description?: unknown; copyFrom?: unknown }, db = prisma) {
  requireRoleAdmin(actor)
  const names = roleName(input.name), info = description(input.description)
  if (input.copyFrom !== undefined && typeof input.copyFrom !== 'string') throw new PolicyError('无效模板', 400)
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    let grants: string[] = []
    if (input.copyFrom) {
      const source = await tx.roleDefinition.findUnique({ where: { id: input.copyFrom as string }, include: { policy: true } })
      if (!source || !source.enabled || source.id === 'ADMIN') throw new PolicyError('只能复制启用中的业务角色', 400)
      grants = source.policy ? validateGrants(source.policy.grants) : source.builtIn ? defaultGrants(source.id) : []
    }
    const role = await tx.roleDefinition.create({ data: { id: `custom_${randomUUID()}`, ...names, description: info } })
    await tx.rolePermissionPolicy.create({ data: { role: role.id, grants, updatedById: actor.userId } })
    await audit(tx, actor, 'role.create', role.id, {}, { ...role, grants, copyFrom: input.copyFrom || null })
    return role
  }, { isolationLevel: 'Serializable' })
}
export async function updateRole(actor: AuthPrincipal, id: string, input: { expectedVersion?: unknown; name?: unknown; description?: unknown; enabled?: unknown }, db = prisma) {
  requireRoleAdmin(actor)
  if (!Number.isSafeInteger(input.expectedVersion)) throw new PolicyError('需要角色版本', 400)
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw new PolicyError('无效启用状态', 400)
  const patch = { ...(input.name === undefined ? {} : roleName(input.name)), ...(input.description === undefined ? {} : { description: description(input.description) }), ...(input.enabled === undefined ? {} : { enabled: input.enabled as boolean }) }
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const previous = await tx.roleDefinition.findUnique({ where: { id } })
    if (!previous) throw new PolicyError('角色不存在', 404)
    if (previous.builtIn) throw new PolicyError('预设角色不能重命名或停用', 400)
    const result = await tx.roleDefinition.updateMany({ where: { id, version: Number(input.expectedVersion) }, data: { ...patch, version: { increment: 1 } } })
    if (!result.count) throw new PolicyError('角色已被修改，请刷新后重试', 409)
    const role = await tx.roleDefinition.findUniqueOrThrow({ where: { id } })
    await audit(tx, actor, 'role.update', id, previous, role)
    return role
  }, { isolationLevel: 'Serializable' })
}
export async function setRoleMember(actor: AuthPrincipal, id: string, userId: string, present: boolean, db = prisma) {
  requireRoleAdmin(actor)
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    const role = await tx.roleDefinition.findUnique({ where: { id } })
    if (!role) throw new PolicyError('角色不存在', 404)
    if (role.builtIn) throw new PolicyError('预设角色成员请使用现有成员管理入口', 400)
    if (present && !role.enabled) throw new PolicyError('停用角色不能添加成员', 400)
    const user = await tx.user.findUnique({ where: { id: userId }, select: { type: true } })
    if (!user || user.type !== 'HUMAN') throw new PolicyError('请选择有效人类账号', 400)
    const existing = await tx.userBusinessRole.findUnique({ where: { userId_role: { userId, role: id } } })
    if (present && !existing) await tx.userBusinessRole.create({ data: { userId, role: id } })
    if (!present && existing) await tx.userBusinessRole.delete({ where: { id: existing.id } })
    if (present !== Boolean(existing)) await audit(tx, actor, present ? 'role.member.add' : 'role.member.remove', id, { userId, present: Boolean(existing) }, { userId, present })
    return { userId, roleId: id, present }
  }, { isolationLevel: 'Serializable' })
}
