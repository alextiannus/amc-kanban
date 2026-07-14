import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const brandId = 'cmqvnplm80004skjgdlmqynuu' // 御膳房
  const userId = 'cmqvnplm30001skjgrpucffyv' // boss@yushanfang.com

  console.log('--- User Roles & Status ---')
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      businessRoles: true,
      crewMemberships: {
        where: { active: true },
        include: {
          crew: { select: { brandId: true } }
        }
      }
    }
  })
  console.log(JSON.stringify(user, null, 2))

  console.log('\n--- Checking brand access manually via query ---')
  const READ_ROLES = ['ADMIN', 'AMC_PRINCIPAL', 'BRAND_OWNER', 'BD']
  const allowedRoles = READ_ROLES

  const hasAccess = await prisma.user.findFirst({
    where: {
      id: userId,
      status: 'ACTIVE',
      OR: [
        { businessRoles: { some: { role: 'ADMIN' } } },
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
    select: { id: true }
  })

  console.log(`Access allowed: ${!!hasAccess}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
