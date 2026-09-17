import { prisma } from '../prisma.ts'
import { AuthorizationError } from './errors.ts'
import type { Capability } from './capabilities.ts'
import type { AuthPrincipal } from './types.ts'
import { allows } from '../role-permissions/store.ts'

export function isAdmin(principal: AuthPrincipal): boolean {
  return principal.globalRoles.includes('ADMIN')
}

export async function canAccessBrand(
  principal: AuthPrincipal,
  brandId: string,
  capability: Capability = 'brand.read',
): Promise<boolean> {
  if (!await allows(principal, capability)) return false
  return canAccessBrandScope(principal, brandId)
}

export async function canAccessBrandScope(principal: AuthPrincipal, brandId: string): Promise<boolean> {
  if (isAdmin(principal)) return true

  const user = await prisma.user.findFirst({
    where: {
      id: { in: [principal.userId, principal.linkedHumanUserId || ''] },
      status: 'ACTIVE',
      OR: [
        {
          crewMemberships: {
            some: {
              active: true,
              crew: { brandId },
            },
          },
        },
        {
          organizationsJoined: {
            some: {
              owner: {
                crewMemberships: {
                  some: {
                    active: true,
                    crew: { brandId },
                  },
                },
              },
            },
          },
        },
      ],
    },
    select: { id: true },
  })
  return Boolean(user)
}

export async function requireCapability(
  principal: AuthPrincipal,
  capability: Capability,
  scope?: { brandId?: string },
): Promise<void> {
  const allowed = scope?.brandId
    ? await canAccessBrand(principal, scope.brandId, capability)
    : await allows(principal, capability)
  if (!allowed) throw new AuthorizationError()
}
