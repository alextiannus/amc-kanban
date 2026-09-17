import { isOverviewAdmin } from './entry-rules.ts'
import type { AuthPrincipal } from '../auth-v2/types.ts'
import { buildOverview, type RemoteContent } from './overview.ts'
import type { loadUserOverview } from './users.ts'

export type OverviewDependencies = {
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
      const result = buildOverview(await deps.content(), detail.context)
      return json({ ...result, user: detail.user, brands: detail.brands, selectedBrandId: detail.selectedBrandId })
    }
    return json(buildOverview(await deps.content()))
  } catch { return json({ error: '权限信息读取失败，请刷新重试' }, 500) }
}
