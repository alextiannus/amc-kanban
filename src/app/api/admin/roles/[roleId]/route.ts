import { roleRequest } from '@/lib/role-permissions/role-handler'
import { updateRole } from '@/lib/role-permissions/roles'
import { contentPolicyReady } from '@/lib/role-permissions/readiness'
import { PolicyError } from '@/lib/role-permissions/store'
export async function PATCH(request: Request, context: { params: Promise<{ roleId: string }> }) {
 return roleRequest(request, async actor => { const body = await request.json(); if (body.enabled === true && !await contentPolicyReady()) throw new PolicyError('Content 权限协议 2 尚未就绪', 503); return updateRole(actor, (await context.params).roleId, body) })
}
