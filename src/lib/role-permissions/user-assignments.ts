export class RoleAssignmentError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

type Role = { id: string; enabled: boolean; builtIn: boolean }

export function planUserRoleAssignments(input: unknown, current: string[], catalog: Role[]) {
  if (!Array.isArray(input) || input.some(id => typeof id !== 'string')) throw new RoleAssignmentError('角色列表无效')
  const requested = [...new Set(input as string[])]
  const byId = new Map(catalog.map(role => [role.id, role]))
  if (requested.some(id => id === 'ADMIN' || !byId.has(id))) throw new RoleAssignmentError('包含不存在或不可分配的角色')
  const add = requested.filter(id => !current.includes(id))
  if (add.some(id => !byId.get(id)?.enabled)) throw new RoleAssignmentError('不能加入已停用的角色')
  return {
    previous: current.filter(id => id !== 'ADMIN'),
    requested,
    add,
    remove: current.filter(id => id !== 'ADMIN' && !requested.includes(id)),
    needsContent: add.some(id => !byId.get(id)?.builtIn),
  }
}
