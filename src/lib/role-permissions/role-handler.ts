import { authenticateCurrentSession } from '../auth-v2/index'
import { PolicyError } from './store'
import { contentPolicyReady } from './readiness'
import { requireRoleAdmin } from './roles'
import type { AuthPrincipal } from '../auth-v2/types'
import { allowedRoleWriteOrigin } from './request-origin'
export async function roleRequest(request: Request, action: (actor: AuthPrincipal) => Promise<unknown>, needsContent = false) {
  const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
  try {
    const actor = await authenticateCurrentSession()
    if (!actor) return json({ error: 'Unauthorized' }, 401)
    requireRoleAdmin(actor)
    if (request.method !== 'GET' && !allowedRoleWriteOrigin(request)) return json({ error: 'Forbidden origin' }, 403)
    if (needsContent && !await contentPolicyReady()) return json({ error: 'Content 权限协议 2 尚未就绪' }, 503)
    return json(await action(actor))
  } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'P2002') return json({ error: '角色名称已存在' }, 409)
    if (code === 'P2034') return json({ error: '角色被同时修改，请刷新重试' }, 409)
    return json({ error: e instanceof PolicyError ? e.message : e instanceof SyntaxError ? '请求内容无效' : '角色服务不可用' }, e instanceof PolicyError ? e.status : e instanceof SyntaxError ? 400 : 503)
  }
}
