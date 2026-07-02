import { PrismaClient } from '@prisma/client'
import { verifyUserApiKey } from '../src/lib/user-management/auth.ts'
import { createMarketingCrew, addCrewMember } from '../src/lib/user-management/crew.ts'
import { canSessionAccessBrand } from '../src/lib/user-management/brandAccess.ts'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function testE2E() {
  console.log('🏁 Starting User Management E2E Test Suite...')

  // 1. Create a dummy human user
  console.log('\nTesting Human User Creation...')
  const testHuman = await prisma.user.create({
    data: {
      email: `test-human-${Date.now()}@example.com`,
      password: 'password123',
      type: 'HUMAN',
      role: 'USER',
      nickname: 'Test Human Owner'
    }
  })
  console.log(`✓ Human user created: ${testHuman.email} (ID: ${testHuman.id})`)

  // 2. Create a dummy AI Agent and link it as an avatar of the human
  console.log('\nTesting AI Agent (Avatar) Onboarding & Linking...')
  const testAgent = await prisma.user.create({
    data: {
      email: `test-agent-${Date.now()}@example.com`,
      password: 'password123',
      type: 'AI_AGENT',
      nickname: 'Test Copywriter Agent',
      ownerId: testHuman.id // Bind as human's avatar
    }
  })
  console.log(`✓ AI Agent created and linked to Human: ${testAgent.nickname} (ID: ${testAgent.id}, Owner: ${testAgent.ownerId})`)

  // 3. Create a dummy brand
  console.log('\nTesting Brand Creation...')
  const testBrand = await prisma.brand.create({
    data: {
      name: `Test Brand ${Date.now()}`,
      ownerId: testHuman.id
    }
  })
  console.log(`✓ Brand created: ${testBrand.name} (ID: ${testBrand.id})`)

  // 4. Initialize MarketingCrew for the Brand
  console.log('\nTesting MarketingCrew Initialization...')
  const crew = await createMarketingCrew(testBrand.id)
  console.log(`✓ MarketingCrew initialized (ID: ${crew.id}, Brand: ${crew.brandId})`)

  // 5. Add Human User to the Brand's Crew & test Cascade Pull
  console.log('\nTesting Crew Add & Auto-Avatar Cascade Pull...')
  await addCrewMember(crew.id, testHuman.id)
  console.log(`✓ Human user added to MarketingCrew.`)

  // Verify that the AI Agent avatar was automatically pulled into the crew
  const agentMembership = await prisma.crewMember.findUnique({
    where: {
      crewId_userId: {
        crewId: crew.id,
        userId: testAgent.id
      }
    }
  })

  if (agentMembership) {
    console.log(`✓ SUCCESS: AI Agent avatar "${testAgent.nickname}" was automatically cascade-pulled into the Crew!`)
  } else {
    throw new Error('FAILED: AI Agent avatar was NOT cascade-pulled into the Crew.')
  }

  // 6. Generate personal API Key for Human User
  console.log('\nTesting User API Key Generation & Lookup...')
  const keyToken = `amc_key_${crypto.randomBytes(24).toString('hex')}`
  const userKey = await prisma.userApiKey.create({
    data: {
      name: 'Default Test Key',
      token: keyToken,
      userId: testHuman.id
    }
  })
  console.log(`✓ User API Key generated: ${userKey.name}`)

  // Verify key resolution
  const resolvedUser = await verifyUserApiKey(keyToken)
  if (resolvedUser && resolvedUser.id === testHuman.id) {
    console.log(`✓ SUCCESS: Token successfully verified and resolved to Human User "${resolvedUser.nickname}"!`)
  } else {
    throw new Error('FAILED: Token verification failed.')
  }

  // 7. Verify Brand Access Permissions (Double-Layer ACL)
  console.log('\nTesting Double-Layer ACL Brand Access checks...')
  
  // Test 7.1: Human access brand READ/WRITE
  const humanCanRead = await canSessionAccessBrand(testBrand.id, testHuman.id, 'HUMAN', 'READ')
  const humanCanWrite = await canSessionAccessBrand(testBrand.id, testHuman.id, 'HUMAN', 'WRITE')

  if (humanCanRead && humanCanWrite) {
    console.log('✓ SUCCESS: Human owner successfully granted READ & WRITE access to Brand.')
  } else {
    throw new Error(`FAILED: Human owner denied access. READ=${humanCanRead}, WRITE=${humanCanWrite}`)
  }

  // Test 7.2: AI Agent avatar access brand READ
  const agentCanRead = await canSessionAccessBrand(testBrand.id, testAgent.id, 'AI_AGENT', 'READ')
  // Test 7.3: AI Agent avatar access brand WRITE (Double-Layer ACL should block this!)
  const agentCanWrite = await canSessionAccessBrand(testBrand.id, testAgent.id, 'AI_AGENT', 'WRITE')

  if (agentCanRead && !agentCanWrite) {
    console.log('✓ SUCCESS: AI Agent avatar granted READ access, but correctly BLOCKED from WRITE access (Double-Layer ACL gate works!).')
  } else {
    throw new Error(`FAILED: AI Agent avatar access incorrect. READ=${agentCanRead}, WRITE=${agentCanWrite} (Expected WRITE to be blocked)`)
  }

  // 8. Clean up test database records
  console.log('\nCleaning up test records...')
  await prisma.userApiKey.delete({ where: { id: userKey.id } })
  await prisma.crewMember.deleteMany({ where: { crewId: crew.id } })
  await prisma.marketingCrew.delete({ where: { id: crew.id } })
  await prisma.brand.delete({ where: { id: testBrand.id } })
  await prisma.user.delete({ where: { id: testAgent.id } })
  await prisma.user.delete({ where: { id: testHuman.id } })
  console.log('✓ Cleanup complete.')

  console.log('\n🎉 ALL USER MANAGEMENT E2E TESTS PASSED SUCCESSFULLY!')
}

testE2E()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error('❌ E2E TEST RUN FAILED:', err)
    await prisma.$disconnect()
    process.exit(1)
  })
