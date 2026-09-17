import { authenticateCurrentSession } from '@/lib/auth-v2'
import { PolicyError, savePolicy } from '@/lib/role-permissions/store'
import { contentPolicyReady } from '@/lib/role-permissions/readiness'
export async function PUT(request: Request, context: { params: Promise<{ role: string }> }) {
  const actor = await authenticateCurrentSession()
  if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.globalRoles.includes('ADMIN')) return Response.json({ error: 'Forbidden' }, { status: 403 })
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: 'Forbidden origin' }, { status: 403 })
  try {
    const body = await request.json()
    if (!await contentPolicyReady()) return Response.json({ error: 'Content 未就绪或权限协议不匹配，暂不能保存' }, { status: 503 })
    return Response.json(await savePolicy(actor, (await context.params).role, body), { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return Response.json({ error: e instanceof PolicyError ? e.message : '保存失败，请重试' }, { status: e instanceof PolicyError ? e.status : 503 }) }
}
