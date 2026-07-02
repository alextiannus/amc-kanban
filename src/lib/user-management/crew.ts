import { prisma } from '../prisma.ts'

/**
 * Creates a MarketingCrew for a brand if it does not already exist.
 */
export async function createMarketingCrew(brandId: string, tx: any = prisma) {
  return tx.marketingCrew.upsert({
    where: { brandId },
    create: { brandId },
    update: {},
  })
}

/**
 * Pulls all AI avatars owned by a human user into a brand's crew.
 */
export async function cascadePullAvatars(crewId: string, humanUserId: string, tx: any = prisma) {
  const avatars = await tx.user.findMany({
    where: { ownerId: humanUserId, type: 'AI_AGENT' },
    select: { id: true }
  })

  await Promise.all(
    avatars.map((avatar: any) =>
      tx.crewMember.upsert({
        where: {
          crewId_userId: {
            crewId,
            userId: avatar.id
          }
        },
        create: {
          crewId,
          userId: avatar.id
        },
        update: {}
      })
    )
  )
}

/**
 * Adds a user to a brand's crew and cascades their AI avatars if the user is a HUMAN.
 */
export async function addCrewMember(crewId: string, userId: string, tx: any = prisma) {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { type: true }
  })

  if (!user) {
    throw new Error(`User with ID ${userId} not found`)
  }

  const member = await tx.crewMember.upsert({
    where: {
      crewId_userId: {
        crewId,
        userId
      }
    },
    create: {
      crewId,
      userId
    },
    update: {}
  })

  // If the added user is human, automatically pull in their AI avatars
  if (user.type === 'HUMAN') {
    await cascadePullAvatars(crewId, userId, tx)
  }

  return member
}

/**
 * Removes a user from a brand's crew.
 */
export async function removeCrewMember(crewId: string, userId: string, tx: any = prisma) {
  // 1. Delete the direct membership
  const deleted = await tx.crewMember.deleteMany({
    where: {
      crewId,
      userId
    }
  })

  // 2. Cascade remove AI avatars of this human from the crew
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { type: true }
  })

  if (user?.type === 'HUMAN') {
    const avatars = await tx.user.findMany({
      where: { ownerId: userId, type: 'AI_AGENT' },
      select: { id: true }
    })
    const avatarIds = avatars.map((a: any) => a.id)

    if (avatarIds.length > 0) {
      await tx.crewMember.deleteMany({
        where: {
          crewId,
          userId: { in: avatarIds }
        }
      })
    }
  }

  return deleted
}
