import { authenticateCurrentSession, isAdmin } from '@/lib/auth-v2'
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import { changePrincipal } from '@/lib/brand-operations/service'
import { operationsJson, operationsFailure } from '@/lib/brand-operations/http'

// Authorized admin session route. API keys do not authorize this UI assignment flow.
export async function PATCH(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  try {
    const actor = await authenticateCurrentSession()
    if (!actor) return operationsJson({ error: 'Unauthorized' }, 401)
    if (!isAdmin(actor) || !allowedRoleWriteOrigin(request)) return operationsJson({ error: 'Forbidden' }, 403)
    const { brandId } = await params
    return operationsJson(await changePrincipal(actor, brandId, await request.json()))
  } catch (error) { return operationsFailure(error) }
}
