import { prisma } from '../prisma.ts'
import { isAmcOperator } from '../amcOperator.ts'

/**
 * Checks if a user is directly in the brand's MarketingCrew.
 */
export async function isUserInBrandCrew(brandId: string, userId: string): Promise<boolean> {
  const member = await prisma.crewMember.findFirst({
    where: {
      crew: { brandId },
      userId
    },
    select: { id: true }
  })
  return !!member
}

/**
 * Evaluates human user access to a brand project.
 * Access is granted if:
 * 1. User is an ADMIN / Operator.
 * 2. User is directly in the brand's Crew.
 * 3. User is in the brand's Crew via Organization membership cascade (e.g. member of owner's org).
 */
export async function canHumanAccessBrand(brandId: string, userId: string): Promise<boolean> {
  // 1. ADMIN operator check
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { type: true, role: true }
  })
  if (isAmcOperator(user)) return true

  // 2. Direct Crew membership check
  const isDirect = await isUserInBrandCrew(brandId, userId)
  if (isDirect) return true

  // 3. Organization cascade check:
  // If an organization owner has direct access to the brand, their organization members inherit access.
  const orgOwners = await prisma.organizationMember.findMany({
    where: { memberId: userId },
    select: { ownerId: true }
  })
  const ownerIds = orgOwners.map((m) => m.ownerId)

  if (ownerIds.length > 0) {
    const orgHasAccess = await prisma.crewMember.findFirst({
      where: {
        crew: { brandId },
        userId: { in: ownerIds }
      },
      select: { id: true }
    })
    if (orgHasAccess) return true
  }

  return false
}

/**
 * Checks session-level brand access (for humans or AI agents).
 */
export async function canSessionAccessBrand(
  brandId: string,
  userId: string,
  userType: string,
  action: string = 'READ'
): Promise<boolean> {
  if (userType === 'AI_AGENT') {
    // AI Agents must be in the brand's Crew
    const inCrew = await isUserInBrandCrew(brandId, userId)
    if (!inCrew) return false

    // AI Agents are blocked from brand-level WRITE actions (Double-Layer ACL)
    if (action === 'WRITE') return false
    return true
  }
  return canHumanAccessBrand(brandId, userId)
}

/**
 * Dual-Layer Access Control checking:
 * 1. Checks if the delegated human user has brand access (Data Domain boundary).
 * 2. Checks if the specific AI agent is permitted to perform the given functional action.
 */
export async function checkDualLayerACL(
  brandId: string,
  humanUserId: string,
  agentId: string,
  action: string
): Promise<boolean> {
  // Layer 1: Data Domain Boundary Check (must have access to the brand)
  const hasDomainAccess = await canHumanAccessBrand(brandId, humanUserId)
  if (!hasDomainAccess) return false

  // Layer 2: Functional Role Restrictions Check for AI Agent
  const agent = await prisma.user.findUnique({
    where: { id: agentId },
    select: { type: true }
  })

  // Must be a valid AI agent
  if (!agent || agent.type !== 'AI_AGENT') return false

  // Whitelist/Blacklist functional actions
  const RESTRICTED_ACTIONS = [
    'delete_account',
    'modify_subscription',
    'manage_users',
    'invite_users',
    'delete_brand'
  ]

  if (RESTRICTED_ACTIONS.includes(action)) {
    console.warn(`[ACL] AI Agent ${agentId} attempted forbidden action: ${action} under delegation of user ${humanUserId}`)
    return false // Strictly blocked
  }

  return true
}
