import { prisma } from './prisma'
import {
  canHumanAccessBrand,
  canSessionAccessBrand,
  isUserInBrandCrew
} from './user-management/brandAccess'

/**
 * Returns true if the given userId has write access/ownership permissions for the brand.
 */
export async function canOwnBrand(brandId: string, userId: string): Promise<boolean> {
  return canSessionAccessBrand(brandId, userId, 'HUMAN', 'WRITE')
}

/**
 * Returns true if a HUMAN user can access a brand through crew membership.
 */
export async function canAccessBrandViaAgentPermission(
  brandId: string,
  humanUserId: string
): Promise<boolean> {
  return canHumanAccessBrand(brandId, humanUserId)
}

/**
 * Returns true when humanUserId is an organization member of any crew member.
 */
export async function canAccessBrandViaOrganization(
  brandId: string,
  humanUserId: string
): Promise<boolean> {
  const orgMemberships = await prisma.organizationMember.findMany({
    where: { memberId: humanUserId },
    select: { ownerId: true },
  })
  const orgOwnerIds = orgMemberships.map((m: any) => m.ownerId)
  if (orgOwnerIds.length === 0) return false

  const link = await prisma.brand.findFirst({
    where: {
      id: brandId,
      crew: {
        members: {
          some: { userId: { in: orgOwnerIds } }
        }
      }
    },
    select: { id: true },
  })
  return !!link
}

/**
 * Returns true if the given agentId is actively linked to the brand's crew.
 */
export async function canAgentAccessBrand(brandId: string, agentId: string): Promise<boolean> {
  return canSessionAccessBrand(brandId, agentId, 'AI_AGENT', 'READ')
}

/**
 * HUMAN project access check for brand view/edit operations.
 */
export async function canHumanAccessBrandProject(
  brandId: string,
  userId: string,
  userRole?: string
): Promise<boolean> {
  return canSessionAccessBrand(brandId, userId, 'HUMAN', 'READ')
}

/**
 * Session-aware brand read check.
 */
export async function canSessionAccessBrandProject(
  brandId: string,
  userId: string,
  userType: string,
  userRole?: string
): Promise<boolean> {
  return canSessionAccessBrand(brandId, userId, userType as 'HUMAN' | 'AI_AGENT', 'READ')
}

/**
 * Full access type resolution.
 */
export async function getBrandAccessType(
  brandId: string,
  userId: string,
  userType: string
): Promise<'owner' | 'agent' | null> {
  if (userType === 'AI_AGENT') {
    return (await canAgentAccessBrand(brandId, userId)) ? 'agent' : null
  }
  return (await canOwnBrand(brandId, userId)) ? 'owner' : null
}
