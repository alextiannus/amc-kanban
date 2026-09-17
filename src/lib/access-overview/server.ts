import { readPolicies } from '../role-permissions/store.ts'
import { prisma } from '../prisma.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
import { canAccessBrandScope } from '../auth-v2/authorize.ts'
import { fetchContentOverview } from './overview.ts'
import { loadUserOverview } from './users.ts'
import { handleOverview } from './handler.ts'

export function serveOverview(authenticate: () => Promise<AuthPrincipal | null>, id?: string, brandId?: string) {
  return handleOverview({
    authenticate,
    policies: () => readPolicies(),
    content: () => fetchContentOverview({ baseUrl: process.env.AMC_CONTENT_SERVICE_URL, token: process.env.CONTENT_SERVICE_INTERNAL_TOKEN }),
    user: (id, brandId) => loadUserOverview(prisma, id, brandId, canAccessBrandScope),
  }, id, brandId)
}
