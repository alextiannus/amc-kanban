/**
 * Brand access control helpers
 *
 * Multi-owner model:
 *  - BrandOwner join table: human users who "own" a brand (can approve, configure, etc.)
 *  - BrandAgent join table: AI agents linked to a brand (can update info, push drafts, etc.)
 *
 * Legacy: Brand.ownerId still exists for backwards-compat DB queries, but is no longer
 * the authoritative source of ownership. Always use canOwnBrand() for access checks.
 */

import { prisma } from './prisma'
import { isAmcOperator, isAmcOperatorRole } from './amcOperator'

/**
 * Returns true if the given userId is an owner of the brand
 * (checks BrandOwner table OR legacy Brand.ownerId for backward compat).
 */
export async function canOwnBrand(brandId: string, userId: string): Promise<boolean> {
  // ADMIN users have full access to all brands
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { type: true, role: true } })
  if (isAmcOperator(user)) return true

  // Primary: BrandOwner join table
  const ownerRow = await prisma.brandOwner.findUnique({
    where: { brandId_userId: { brandId, userId } },
    select: { id: true },
  })
  if (ownerRow) return true

  // Fallback: legacy ownerId field (for brands created before multi-owner migration)
  const brand = await prisma.brand.findFirst({
    where: { id: brandId, ownerId: userId },
    select: { id: true },
  })
  return !!brand
}

/**
 * Returns true if a HUMAN user can access a brand through delegated AI permissions:
 * human -> AgentPermission -> AI agent -> BrandAgent(active) -> brand.
 */
export async function canAccessBrandViaAgentPermission(
  brandId: string,
  humanUserId: string
): Promise<boolean> {
  const link = await prisma.brandAgent.findFirst({
    where: {
      brandId,
      active: true,
      agent: {
        assignedToHumans: {
          some: { humanId: humanUserId },
        },
      },
    },
    select: { id: true },
  })
  return !!link
}

/**
 * Returns true if the given agentId is actively linked to the brand
 * via the BrandAgent join table.
 */
export async function canAgentAccessBrand(brandId: string, agentId: string): Promise<boolean> {
  const link = await prisma.brandAgent.findUnique({
    where: { brandId_agentId: { brandId, agentId } },
    select: { active: true },
  })
  return !!link?.active
}

/**
 * HUMAN project access check for brand view/edit operations.
 * Access is granted if user is admin, explicit owner, legacy owner, or delegated through AgentPermission.
 */
export async function canHumanAccessBrandProject(
  brandId: string,
  userId: string,
  userRole?: string
): Promise<boolean> {
  if (isAmcOperatorRole(userRole)) return true

  if (await canOwnBrand(brandId, userId)) return true

  return canAccessBrandViaAgentPermission(brandId, userId)
}

/**
 * Session-aware brand read check:
 * - AI_AGENT users: linked BrandAgent(active)
 * - HUMAN users: canHumanAccessBrandProject()
 */
export async function canSessionAccessBrandProject(
  brandId: string,
  userId: string,
  userType: string,
  userRole?: string
): Promise<boolean> {
  if (userType === 'AI_AGENT') {
    return canAgentAccessBrand(brandId, userId)
  }
  return canHumanAccessBrandProject(brandId, userId, userRole)
}

/**
 * Full access check:
 * - HUMAN users: must be in BrandOwner table (or legacy ownerId)
 * - AI_AGENT users: must be in BrandAgent table (active)
 *
 * Returns 'owner' | 'agent' | null
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
