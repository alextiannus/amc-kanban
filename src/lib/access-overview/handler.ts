import { isOverviewAdmin } from './entry-rules.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
import { buildOverview, type RemoteContent } from './overview.ts'
import type { loadUserOverview } from './users.ts'

export type OverviewDependencies = {
  policies?: () => Promise<{ policies: Record<string, string[]>; versions: Record<string, number>; roles?: import('../role-permissions/contract.ts').RoleDefinition[] }>
  authenticate: () => Promise<AuthPrincipal | null>
  content: () => Promise<RemoteContent>
  user: (id: string, brandId?: string) => ReturnType<typeof loadUserOverview>
}
export async function handleOverview(deps: OverviewDependencies, id?: string, brandId?: string): Promise<Response> {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
  try {
    const principal = await deps.authenticate()
    if (!principal) return json({ error: 'Unauthorized' }, 401)
    if (!isOverviewAdmin(principal)) return json({ error: 'Forbidden' }, 403)
    if (brandId && brandId.length > 128) return json({ error: 'Invalid brandId' }, 400)
    if (id) {
      const detail = await deps.user(id, brandId)
      if (!detail) return json({ error: 'User not found' }, 404)
      const policy = await deps.policies?.()
      const result = buildOverview(await deps.content(), detail.context, policy?.policies, policy?.roles)
      return json({ ...result, policyVersions: policy?.versions, user: { ...detail.user, roles: (detail.user.assignedRoleIds || detail.user.roles).filter(id => !policy?.roles || policy.roles.some(role => role.id === id && role.enabled)), menuRoles: (detail.user.assignedRoleIds || detail.user.roles).filter(id => !policy?.roles || policy.roles.some(role => role.id === id && role.enabled)) }, brands: detail.brands, selectedBrandId: detail.selectedBrandId })
    }
    const policy = await deps.policies?.()
    return json({ ...buildOverview(await deps.content(), undefined, policy?.policies, policy?.roles), policyVersions: policy?.versions })
  } catch { return json({ error: '权限信息读取失败，请刷新重试' }, 500) }
}
