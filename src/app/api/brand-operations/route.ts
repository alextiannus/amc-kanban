import { authenticateCurrentSession } from '@/lib/auth-v2'
import { grantsFor } from '@/lib/role-permissions/store'
import { canReadOperations } from '@/lib/brand-operations/policy'
import { listOperations } from '@/lib/brand-operations/service'
import { operationsJson, operationsFailure } from '@/lib/brand-operations/http'

// Authorized session route: operations roles + effective grants + scoped Crew query.
export async function GET(request: Request) {
  try {
    const actor = await authenticateCurrentSession()
    if (!actor) return operationsJson({ error: 'Unauthorized' }, 401)
    if (!canReadOperations(actor.globalRoles, await grantsFor(actor))) return operationsJson({ error: 'Forbidden' }, 403)
    return operationsJson(await listOperations(actor, new URL(request.url).searchParams))
  } catch (error) { return operationsFailure(error) }
}
