import { prisma } from '../prisma.ts'

export type CrewRole = 'OWNER' | 'PRINCIPAL' | 'EDITOR' | 'VIEWER'

export async function createMarketingCrew(brandId: string, tx: any = prisma) {
  return tx.marketingCrew.upsert({
    where: { brandId },
    create: { brandId },
    update: {},
  })
}

/**
 * Add one real system user with an explicit brand role. Global roles and
 * User.type never dynamically infer the Crew relationship.
 */
export async function addCrewMember(
  crewId: string,
  userId: string,
  role: CrewRole,
  tx: any = prisma,
) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })
  if (!user) throw new Error(`User with ID ${userId} not found`)

  return tx.crewMember.upsert({
    where: { crewId_userId: { crewId, userId } },
    create: {
      crewId,
      userId,
      role,
      active: true,
      source: 'DIRECT',
    },
    update: {
      role,
      active: true,
      source: 'DIRECT',
    },
  })
}

export async function removeCrewMember(crewId: string, userId: string, tx: any = prisma) {
  return tx.crewMember.updateMany({
    where: { crewId, userId, active: true },
    data: { active: false },
  })
}
