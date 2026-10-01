import { activeUserCredential } from '@/lib/auth-v2/api-key'
import { timingSafeEqual } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { principalFromUser } from '@/lib/auth-v2/types'
import { canAccessBrandScope } from '@/lib/auth-v2/authorize'
import { verifyAccessIdentity } from '@/lib/role-permissions/token'
import { readPolicies } from '@/lib/role-permissions/store'
import { PERMISSION_PROTOCOL, effectiveGrants, permissionSources } from '@/lib/role-permissions/contract'
import { loadUserOverview } from '@/lib/access-overview/users'

export async function POST(request: Request) {
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN
  const actual = request.headers.get('x-content-service-token') || ''
  const suppliedToken = Buffer.from(actual)
  const expectedToken = Buffer.from(expected || '')
  if (!expected || suppliedToken.length !== expectedToken.length || !timingSafeEqual(suppliedToken, expectedToken)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await request.json()
    if (body.protocolVersion !== PERMISSION_PROTOCOL) return Response.json({ error: 'Permission protocol mismatch' }, { status: 409 })
    const identity = body.purpose === 'job' && typeof body.userId === 'string' && (body.brandId === undefined || typeof body.brandId === 'string')
      ? { sub: body.userId, brandId: body.brandId, authVersion: undefined, source: undefined, credentialId: undefined }
      : verifyAccessIdentity(body.identity)
    if (!identity) return Response.json({ error: '请重新从 Kanban 进入 Content' }, { status: 401 })
    const user = await prisma.user.findUnique({ where: { id: identity.sub }, include: { businessRoles: true, owner: { include: { businessRoles: true } } } })
    if (!user || user.status !== 'ACTIVE' || identity.authVersion !== undefined && user.authVersion !== identity.authVersion) return Response.json({ error: 'Identity revoked' }, { status: 401 })
    if (identity.source === 'api_key' && (!identity.credentialId || !await activeUserCredential(user.id, identity.credentialId))) return Response.json({ error: 'Credential revoked' }, { status: 401 })
    const principal = principalFromUser(user, identity.source || 'session', identity.credentialId)
    if (identity.brandId && !await canAccessBrandScope(principal, identity.brandId)) return Response.json({ error: '没有该品牌授权' }, { status: 403 })
    const { policies, versions, roles: catalog } = await readPolicies()
    const assignedRoleIds = principal.permissionRoleIds || principal.globalRoles
    const roleIds = assignedRoleIds.filter(id => catalog.some(role => role.id === id && role.enabled))
    const scope = principal.globalRoles.includes('ADMIN') ? null : await loadUserOverview(prisma, user.id, undefined, canAccessBrandScope)
    return Response.json({ protocolVersion: PERMISSION_PROTOCOL, userId: user.id, roles: roleIds, assignedRoleIds, brandId: identity.brandId, brandIds: scope?.brands.map(brand => brand.id) || [], grants: effectiveGrants(roleIds, policies), sources: permissionSources(roleIds, policies), versions }, { headers: { 'Cache-Control': 'no-store' } })
  } catch { return Response.json({ error: 'Permission service unavailable' }, { status: 503 }) }
}
