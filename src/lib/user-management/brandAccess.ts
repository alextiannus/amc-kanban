import { prisma } from '../prisma.ts'

const READ_ROLES = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD']
const WRITE_ROLES = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER']

/**
 * Direct Crew membership only. Organization inheritance is intentionally not
 * represented as a second CrewMember row.
 */
export async function isUserInBrandCrew(brandId: string, userId: string): Promise<boolean> {
  const member = await prisma.crewMember.findFirst({
    where: {
      userId,
      active: true,
      crew: { brandId },
    },
    select: { id: true },
  })
  return Boolean(member)
}

/**
 * Compatibility entry point for legacy call sites.
 *
 * Authorization is resolved in one User query:
 * - explicit global role
 * - direct active CrewMember, or Organization Owner CrewMember inheritance
 * - ADMIN global access
 */
export async function canUserAccessBrand(
  brandId: string,
  userId: string,
  action: string = 'READ',
): Promise<boolean> {
  const allowedRoles = action === 'READ' ? READ_ROLES : WRITE_ROLES
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      status: 'ACTIVE',
      OR: [
        { businessRoles: { some: { role: 'ADMIN' } } },
        // Transitional safety until User.role is removed.
        { role: 'ADMIN' },
        {
          AND: [
            { businessRoles: { some: { role: { in: allowedRoles } } } },
            {
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
          ],
        },
      ],
    },
    select: { id: true },
  })
  return Boolean(user)
}

export async function canHumanAccessBrand(brandId: string, userId: string): Promise<boolean> {
  return canUserAccessBrand(brandId, userId, 'READ')
}

/**
 * User.type does not influence authorization in Auth V2.
 */
export async function canSessionAccessBrand(
  brandId: string,
  userId: string,
  _userType: string,
  action: string = 'READ',
): Promise<boolean> {
  return canUserAccessBrand(brandId, userId, action)
}

/**
 * Legacy adapter retained during the 24-hour delegated-key transition.
 * The AMC Agent is authorized as itself and receives no type-based blacklist.
 */
export async function checkDualLayerACL(
  brandId: string,
  _humanUserId: string,
  agentId: string,
  action: string,
): Promise<boolean> {
  return canUserAccessBrand(brandId, agentId, action === 'read' ? 'READ' : 'WRITE')
}
