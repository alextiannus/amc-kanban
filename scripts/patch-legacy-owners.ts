import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Running database patch to link legacy Brand.ownerId to V2 tables (BrandOwner, UserBusinessRole, CrewMember)...')

  const brands = await prisma.brand.findMany({
    where: {
      ownerId: { not: null }
    }
  })

  console.log(`Found ${brands.length} brands with ownerId.`)

  for (const brand of brands) {
    const ownerId = brand.ownerId!
    console.log(`\nProcessing brand: "${brand.name}" (ID: ${brand.id}), Owner ID: ${ownerId}`)

    // 1. Check/create UserBusinessRole for the owner
    const ownerUser = await prisma.user.findUnique({ where: { id: ownerId } })
    if (!ownerUser) {
      console.warn(`⚠️ Owner user (ID: ${ownerId}) not found for brand "${brand.name}". Skipping.`)
      continue
    }

    const bizRole = await prisma.userBusinessRole.upsert({
      where: {
        userId_role: {
          userId: ownerId,
          role: 'BRAND_OWNER'
        }
      },
      create: {
        userId: ownerId,
        role: 'BRAND_OWNER'
      },
      update: {}
    })
    console.log(`✅ UserBusinessRole "BRAND_OWNER" verified for user ${ownerUser.email}.`)

    // 2. Check/create BrandOwner mapping
    const brandOwner = await prisma.brandOwner.upsert({
      where: {
        brandId_userId: {
          brandId: brand.id,
          userId: ownerId
        }
      },
      create: {
        brandId: brand.id,
        userId: ownerId,
        role: 'owner'
      },
      update: {}
    })
    console.log(`✅ BrandOwner record verified.`)

    // 3. Find or create MarketingCrew
    const crew = await prisma.marketingCrew.upsert({
      where: { brandId: brand.id },
      create: { brandId: brand.id },
      update: {}
    })
    console.log(`✅ MarketingCrew verified (ID: ${crew.id}).`)

    // 4. Check/create CrewMember
    const crewMember = await prisma.crewMember.upsert({
      where: {
        crewId_userId: {
          crewId: crew.id,
          userId: ownerId
        }
      },
      create: {
        crewId: crew.id,
        userId: ownerId,
        active: true
      },
      update: {
        active: true
      }
    })
    console.log(`✅ CrewMember record verified (ID: ${crewMember.id}).`)
  }

  console.log('\n🎉 Database patch completed successfully!')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
