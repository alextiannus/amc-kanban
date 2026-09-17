import { prisma } from '../prisma.ts'
import { principalFromUser } from '../auth-v2/types.ts'
import { canAccessBrandScope } from '../auth-v2/authorize.ts'
import { signAccessIdentity } from './token.ts'
import { allows, PolicyError } from './store.ts'
export async function requireActorPermission(actorId: string, permission: string, brandId?: string) {
  const user = await prisma.user.findUnique({ where: { id: actorId }, include: { businessRoles: true, owner: { include: { businessRoles: true } } } })
  if (!user || user.status !== 'ACTIVE') throw new PolicyError('Actor is inactive or missing', 403)
  const principal = principalFromUser(user, 'session')
  if (!await allows(principal, permission)) throw new PolicyError(`Permission denied: ${permission}`, 403)
  if (brandId && !await canAccessBrandScope(principal, brandId)) throw new PolicyError('Brand access denied', 403)
  return principal
}
export async function actorIdentity(actorId: string, permission: string, brandId?: string) {
  return signAccessIdentity(await requireActorPermission(actorId, permission, brandId), brandId)
}
