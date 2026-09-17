import { authenticateCurrentSession } from '@/lib/auth-v2'
import { readPolicies } from '@/lib/role-permissions/store'
import { PERMISSION_MODULES, PERMISSION_PROTOCOL } from '@/lib/role-permissions/contract'
import { contentPolicyReady } from '@/lib/role-permissions/readiness'
export async function GET() {
  const actor = await authenticateCurrentSession()
  if (!actor) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!actor.globalRoles.includes('ADMIN')) return Response.json({ error: 'Forbidden' }, { status: 403 })
  try { const snapshot = await readPolicies(); return Response.json({ ...snapshot, policies: snapshot.configuredPolicies, modules: PERMISSION_MODULES, protocolVersion: PERMISSION_PROTOCOL, contentReady: await contentPolicyReady() }, { headers: { 'Cache-Control': 'no-store' } }) }
  catch { return Response.json({ error: '权限策略不可用，请确认数据库迁移完成' }, { status: 503 }) }
}
