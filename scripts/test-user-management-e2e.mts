import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { createMarketingCrew, addCrewMember } from '../src/lib/user-management/crew.ts'
import { canSessionAccessBrand } from '../src/lib/user-management/brandAccess.ts'
import {
  authenticateApiKey,
  hashApiKeyToken,
  apiKeyPrefix,
} from '../src/lib/auth-v2/api-key.ts'

const prisma = new PrismaClient()
const suffix = `${Date.now()}-${crypto.randomUUID()}`
let humanId: string | null = null
let agentId: string | null = null
let organizationMemberId: string | null = null
let brandId: string | null = null

async function cleanup() {
  if (humanId && organizationMemberId) {
    await prisma.organizationMember.deleteMany({
      where: { ownerId: humanId, memberId: organizationMemberId },
    })
  }
  if (brandId) {
    await prisma.brand.deleteMany({ where: { id: brandId } })
  }
  const userIds = [humanId, agentId, organizationMemberId].filter(
    (id): id is string => Boolean(id),
  )
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } })
}

async function testE2E() {
  console.log('Starting Auth V2 user/Crew E2E test...')

  const human = await prisma.user.create({
    data: {
      email: `auth-v2-owner-${suffix}@example.com`,
      password: 'test-only',
      type: 'HUMAN',
      role: 'USER',
      businessRoles: { create: { role: 'BRAND_OWNER' } },
    },
  })
  humanId = human.id

  const agent = await prisma.user.create({
    data: {
      email: `auth-v2-agent-${suffix}@example.com`,
      password: 'test-only',
      type: 'AI_AGENT',
      role: 'USER',
      ownerId: human.id,
      businessRoles: { create: { role: 'AMC_PRINCIPAL' } },
    },
  })
  agentId = agent.id

  const organizationMember = await prisma.user.create({
    data: {
      email: `auth-v2-org-member-${suffix}@example.com`,
      password: 'test-only',
      type: 'HUMAN',
      role: 'USER',
      businessRoles: { create: { role: 'BRAND_OWNER' } },
    },
  })
  organizationMemberId = organizationMember.id

  const brand = await prisma.brand.create({
    data: { name: `Auth V2 Brand ${suffix}`, ownerId: human.id },
  })
  brandId = brand.id
  const crew = await createMarketingCrew(brand.id)

  await addCrewMember(crew.id, human.id, 'OWNER')
  assert.equal(
    await prisma.crewMember.count({ where: { crewId: crew.id, userId: agent.id } }),
    0,
    'Agent must not be cascaded from a human owner',
  )

  await addCrewMember(crew.id, agent.id, 'EDITOR')
  await prisma.organizationMember.create({
    data: { ownerId: human.id, memberId: organizationMember.id, role: 'member' },
  })

  for (const user of [human, agent, organizationMember]) {
    assert.equal(
      await canSessionAccessBrand(brand.id, user.id, user.type, 'READ'),
      true,
      `${user.email} should read through direct Crew or organization inheritance`,
    )
    assert.equal(
      await canSessionAccessBrand(brand.id, user.id, user.type, 'WRITE'),
      true,
      `${user.email} should write with its explicit global role`,
    )
  }

  const token = `amc_key_${crypto.randomBytes(32).toString('base64url')}`
  const key = await prisma.userApiKey.create({
    data: {
      name: 'Auth V2 E2E key',
      tokenHash: hashApiKeyToken(token),
      prefix: apiKeyPrefix(token),
      userId: agent.id,
    },
  })
  assert.equal(key.token, null, 'New API keys must not persist plaintext')

  const resolved = await authenticateApiKey(token)
  assert.equal(resolved?.userId, agent.id)

  await prisma.userApiKey.update({
    where: { id: key.id },
    data: { revokedAt: new Date() },
  })
  assert.equal(await authenticateApiKey(token), null, 'Revoked key must fail')

  console.log('Auth V2 user/Crew E2E test passed.')
}

testE2E()
  .then(cleanup)
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error('Auth V2 user/Crew E2E test failed:', error)
    await cleanup().catch(console.error)
    await prisma.$disconnect()
    process.exit(1)
  })
