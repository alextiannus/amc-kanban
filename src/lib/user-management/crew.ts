import { prisma } from '../prisma.ts'

export async function createMarketingCrew(brandId: string, tx: any = prisma) {
  return tx.marketingCrew.upsert({
    where: { brandId },
    create: { brandId },
    update: {},
  })
}

function resolveCrewRole(user: {
  type: string
  role: string
  businessRoles: Array<{ role: string }>
}) {
  const roles = new Set(user.businessRoles.map((entry) => entry.role))
  if (user.role === 'ADMIN' || roles.has('ADMIN') || roles.has('AMC_PRINCIPAL')) {
    return 'PRINCIPAL'
  }
  if (roles.has('BRAND_OWNER')) return 'OWNER'
  if (user.type === 'AI_AGENT') return 'EDITOR'
  return 'VIEWER'
}

/**
 * Add one real system user to a Crew. AMC Agents are independent users and are
 * never implicitly cascaded from a human owner.
 */
export async function addCrewMember(crewId: string, userId: string, tx: any = prisma) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: {
      type: true,
      role: true,
      businessRoles: { select: { role: true } },
    },
  })
  if (!user) throw new Error(`User with ID ${userId} not found`)

  const role = resolveCrewRole(user)
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
