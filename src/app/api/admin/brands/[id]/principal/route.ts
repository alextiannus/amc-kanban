import { authenticateCurrentSession, isAdmin } from '@/lib/auth-v2'
import { allowedRoleWriteOrigin } from '@/lib/role-permissions/request-origin'
import { changePrincipal, getPrincipalTeam } from '@/lib/brand-operations/service'
import { operationsJson, operationsFailure } from '@/lib/brand-operations/http'

type Context = { params: Promise<{ id: string }> }
export async function GET(_request: Request, { params }: Context) {
  try {
    const actor = await authenticateCurrentSession()
    if (!actor) return operationsJson({ error: 'Unauthorized' }, 401)
    if (!isAdmin(actor)) return operationsJson({ error: 'Forbidden' }, 403)
    return operationsJson(await getPrincipalTeam((await params).id))
  } catch (error) { return operationsFailure(error) }
}
export async function PATCH(request: Request, { params }: Context) {
  try {
    const actor = await authenticateCurrentSession()
    if (!actor) return operationsJson({ error: 'Unauthorized' }, 401)
    if (!isAdmin(actor) || !allowedRoleWriteOrigin(request)) return operationsJson({ error: 'Forbidden' }, 403)
    return operationsJson(await changePrincipal(actor, (await params).id, await request.json(), undefined, true))
  } catch (error) { return operationsFailure(error) }
}
