import { prisma } from '@/lib/prisma'
import { AuthorizationError } from './errors'
import { hasCapability, type Capability } from './capabilities'
import type { AuthPrincipal } from './types'

export function isAdmin(principal: AuthPrincipal): boolean {
  return principal.globalRoles.includes('ADMIN')
}

export async function canAccessBrand(
  principal: AuthPrincipal,
  brandId: string,
  capability: Capability = 'brand.read',
): Promise<boolean> {
  if (!hasCapability(principal.globalRoles, capability)) return false
  if (isAdmin(principal)) return true

  const user = await prisma.user.findFirst({
    where: {
      id: principal.userId,
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
    : hasCapability(principal.globalRoles, capability)
  if (!allowed) throw new AuthorizationError()
}
