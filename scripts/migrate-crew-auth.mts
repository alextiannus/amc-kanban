import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('🚀 Starting User Management & Crew auth database migration...')

  // Step 1: Create MarketingCrew for each Brand if not exists
  console.log('\n--- Step 1: Creating MarketingCrew for brands ---')
  const brands = await prisma.brand.findMany()
  console.log(`Found ${brands.length} brands.`)

  for (const brand of brands) {
    const crew = await prisma.marketingCrew.upsert({
      where: { brandId: brand.id },
      create: { brandId: brand.id },
      update: {},
    })
    console.log(`MarketingCrew ready for Brand "${brand.name}" (ID: ${brand.id})`)
  }

  // Step 2: Migrate BrandOwner records to CrewMember
  console.log('\n--- Step 2: Migrating BrandOwners to CrewMembers ---')
  const brandOwners = await prisma.brandOwner.findMany()
  console.log(`Found ${brandOwners.length} BrandOwner records.`)

  let ownerMigrationCount = 0
  for (const bo of brandOwners) {
    const crew = await prisma.marketingCrew.findUnique({
      where: { brandId: bo.brandId }
    })
    if (!crew) {
      console.warn(`Warning: MarketingCrew not found for Brand ID ${bo.brandId}, skipping BrandOwner ${bo.id}`)
      continue
    }

    await prisma.crewMember.upsert({
      where: {
        crewId_userId: {
          crewId: crew.id,
          userId: bo.userId
        }
      },
      create: {
        crewId: crew.id,
        userId: bo.userId
      },
      update: {}
    })
    ownerMigrationCount++
  }
  console.log(`Successfully migrated ${ownerMigrationCount} BrandOwners to CrewMembers.`)

  // Step 3: Migrate BrandAgent records to CrewMember
  console.log('\n--- Step 3: Migrating BrandAgents to CrewMembers ---')
  const brandAgents = await prisma.brandAgent.findMany()
  console.log(`Found ${brandAgents.length} BrandAgent records.`)

  let agentMigrationCount = 0
  for (const ba of brandAgents) {
    const crew = await prisma.marketingCrew.findUnique({
      where: { brandId: ba.brandId }
    })
    if (!crew) {
      console.warn(`Warning: MarketingCrew not found for Brand ID ${ba.brandId}, skipping BrandAgent ${ba.id}`)
      continue
    }

    await prisma.crewMember.upsert({
      where: {
        crewId_userId: {
          crewId: crew.id,
          userId: ba.agentId
        }
      },
      create: {
        crewId: crew.id,
        userId: ba.agentId
      },
      update: {}
    })
    agentMigrationCount++
  }
  console.log(`Successfully migrated ${agentMigrationCount} BrandAgents to CrewMembers.`)

  // Step 4: Establish ownerId (AI Avatar relation) from AgentPermission
  console.log('\n--- Step 4: Setting ownerId for AI Agents based on AgentPermission ---')
  const permissions = await prisma.agentPermission.findMany()
  console.log(`Found ${permissions.length} AgentPermission records.`)

  let avatarRelationCount = 0
  for (const perm of permissions) {
    // Verify human exists and agent exists
    const human = await prisma.user.findUnique({ where: { id: perm.humanId } })
    const agent = await prisma.user.findUnique({ where: { id: perm.agentId } })

    if (human && agent && agent.type === 'AI_AGENT') {
      await prisma.user.update({
        where: { id: agent.id },
        data: { ownerId: human.id }
      })
      avatarRelationCount++
      console.log(`Linked AI Agent "${agent.nickname || agent.email}" (ID: ${agent.id}) as avatar to Human "${human.nickname || human.email}" (ID: ${human.id})`)
    }
  }
  console.log(`Successfully linked ${avatarRelationCount} AI Agents to their human owners.`)

  // Step 5: Map historical AI keys to human profiles (Di Renjie -> Zhangyi, Tang Bohu -> LiWei, Xiaoqiao -> 田野)
  console.log('\n--- Step 5: Mapping Production AI Keys to Humans (Hot Mapping) ---')
  
  const mappings = [
    {
      agentQuery: { OR: [{ nickname: '狄仁杰' }, { email: { contains: 'direnjie' } }] },
      humanQuery: { OR: [{ nickname: 'Zhangyi' }, { nickname: 'zhangyi' }, { nickname: '张仪' }, { email: { contains: 'zhangyi' } }] },
      label: '狄仁杰 ➔ Zhangyi'
    },
    {
      agentQuery: { OR: [{ nickname: '唐伯虎' }, { email: { contains: 'tangbohu' } }] },
      humanQuery: { OR: [{ nickname: 'LiWei' }, { nickname: 'liwei' }, { nickname: '李伟' }, { email: { contains: 'liwei' } }] },
      label: '唐伯虎 ➔ LiWei'
    },
    {
      agentQuery: { OR: [{ nickname: '小桥' }, { email: { contains: 'xiaoqiao' } }] },
      humanQuery: { OR: [{ nickname: '田野' }, { nickname: 'tianye' }, { email: { contains: 'tianye' } }] },
      label: '小桥 ➔ 田野'
    }
  ]

  const mappedKeys = new Set<string>()

  for (const mapping of mappings) {
    const agent = await prisma.user.findFirst({
      where: { type: 'AI_AGENT', ...mapping.agentQuery },
      select: { id: true, nickname: true, email: true, apiKey: true }
    })

    const human = await prisma.user.findFirst({
      where: { type: 'HUMAN', ...mapping.humanQuery },
      select: { id: true, nickname: true, email: true }
    })

    if (agent && human && agent.apiKey) {
      const oldKey = agent.apiKey
      
      // Clean prefix if it is a placeholder or bearer
      const cleanKey = oldKey.replace(/^Bearer\s+/i, '').trim()

      await prisma.userApiKey.upsert({
        where: { token: cleanKey },
        create: {
          userId: human.id,
          token: cleanKey,
          name: `Delegated Agent Key (${agent.nickname || 'AI Agent'})`
        },
        update: {
          userId: human.id
        }
      })

      // Nullify/clear the old apiKey field on the User table for the agent
      await prisma.user.update({
        where: { id: agent.id },
        data: { apiKey: null }
      })

      mappedKeys.add(cleanKey)
      console.log(`Mapped key for [${mapping.label}]: Agent ID ${agent.id} ➔ Human ID ${human.id}. Old key moved to UserApiKey.`)
    } else {
      console.log(`Skipped [${mapping.label}] mapping (Agent or Human user not found or agent has no apiKey).`)
    }
  }

  // Step 6: Generate Personal API Keys for all other human users
  console.log('\n--- Step 6: Generating Personal API Keys for Human users ---')
  const humans = await prisma.user.findMany({
    where: { type: 'HUMAN' }
  })

  let generatedCount = 0
  for (const human of humans) {
    // Check if they already have an API key (especially mapped ones)
    const existing = await prisma.userApiKey.findFirst({
      where: { userId: human.id }
    })

    if (!existing) {
      // Generate a new random token: amc_usr_ + 32-char hex
      const randomToken = `amc_usr_${crypto.randomBytes(16).toString('hex')}`
      await prisma.userApiKey.create({
        data: {
          userId: human.id,
          token: randomToken,
          name: 'Default Personal API Key'
        }
      })
      generatedCount++
    }
  }
  console.log(`Generated default API Keys for ${generatedCount} human users.`)

  console.log('\n🎉 User Management & Crew auth database migration completed successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
