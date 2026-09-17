import { roleRequest } from '@/lib/role-permissions/role-handler'
import { setRoleMember } from '@/lib/role-permissions/roles'
type Context = { params: Promise<{ roleId: string; userId: string }> }
export async function PUT(request: Request, context: Context) { return roleRequest(request, async actor => { const p = await context.params; return setRoleMember(actor, p.roleId, p.userId, true) }, true) }
export async function DELETE(request: Request, context: Context) { return roleRequest(request, async actor => { const p = await context.params; return setRoleMember(actor, p.roleId, p.userId, false) }) }
