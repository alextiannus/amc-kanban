#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { prisma } from '../src/lib/prisma.ts'
import { resolveAssignment } from '../src/lib/assignmentPool.ts'

function rid(prefix: string) {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

async function ensurePoolAgent() {
  const agent = await prisma.user.findFirst({
    where: { type: 'AI_AGENT' },
    select: { id: true },
  })

  if (!agent) {
    throw new Error('No AI_AGENT found. Create at least one AI agent before running this test.')
  }

  await prisma.assignmentPoolMember.upsert({
    where: { agentId: agent.id },
    create: {
      agentId: agent.id,
      active: true,
      capacity: 30,
      priority: 100,
      industries: ['food'],
      regions: ['sg'],
    },
    update: {
      active: true,
      capacity: 30,
      priority: 100,
      industries: ['food'],
      regions: ['sg'],
    },
  })

  await prisma.assignmentPoolConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      enabled: true,
      overflowPolicy: 'fallback_only',
      rebalancePolicy: 'manual_only',
      matchingOrder: 'industry_first',
      fallbackAgentId: agent.id,
    },
    update: {
      enabled: true,
      overflowPolicy: 'fallback_only',
      rebalancePolicy: 'manual_only',
      matchingOrder: 'industry_first',
      fallbackAgentId: agent.id,
    },
  })

  return agent.id
}

async function testUserRegisterFlow(expectedAgentId: string) {
  const email = `${rid('assignment-user')}@example.com`
  const human = await prisma.user.create({
    data: {
      email,
      password: 'test-password',
      type: 'HUMAN',
      role: 'USER',
      country: 'Singapore',
      phone: '+65-0000-0000',
      nickname: rid('user'),
    },
    select: { id: true },
  })

  const idemKey = rid('idem-user')
  const first = await resolveAssignment({
    subjectType: 'user_register',
    subjectId: human.id,
    industry: 'food',
    region: 'sg',
    idempotencyKey: idemKey,
    dryRun: false,
    createdBy: 'system',
  })

  const second = await resolveAssignment({
    subjectType: 'user_register',
    subjectId: human.id,
    industry: 'food',
    region: 'sg',
    idempotencyKey: idemKey,
    dryRun: false,
    createdBy: 'system',
  })

  assert.equal(first.selectedAgentId, expectedAgentId)
  assert.equal(second.selectedAgentId, expectedAgentId)
  assert.equal(first.decisionId, second.decisionId)

  const perm = await prisma.agentPermission.findUnique({
    where: {
      humanId_agentId: {
        humanId: human.id,
        agentId: expectedAgentId,
      },
    },
  })
  assert.ok(perm)

  await prisma.agentPermission.deleteMany({ where: { humanId: human.id } })
  await prisma.user.delete({ where: { id: human.id } })

  return { first, second }
}

async function testBrandCreateFlow(expectedAgentId: string) {
  const brand = await prisma.brand.create({
    data: {
      name: rid('assignment-brand'),
      timezone: 'Asia/Singapore',
      status: 'ACTIVE',
    },
    select: { id: true },
  })

  const result = await resolveAssignment({
    subjectType: 'brand_create',
    subjectId: brand.id,
    industry: 'food',
    region: 'sg',
    dryRun: false,
    createdBy: 'system',
  })

  assert.equal(result.selectedAgentId, expectedAgentId)

  const link = await prisma.brandAgent.findUnique({
    where: {
      brandId_agentId: {
        brandId: brand.id,
        agentId: expectedAgentId,
      },
    },
  })
  assert.ok(link?.active)

  await prisma.brandAgent.deleteMany({ where: { brandId: brand.id } })
  await prisma.brandOwner.deleteMany({ where: { brandId: brand.id } })
  await prisma.brand.delete({ where: { id: brand.id } })

  return result
}

async function main() {
  const expectedAgentId = await ensurePoolAgent()

  const userFlow = await testUserRegisterFlow(expectedAgentId)
  const brandFlow = await testBrandCreateFlow(expectedAgentId)

  console.log('ASSIGNMENT_FLOW_OK', JSON.stringify({
    expectedAgentId,
    userDecisionId: userFlow.first.decisionId,
    brandDecisionId: brandFlow.decisionId,
  }))
}

main()
  .catch((error) => {
    console.error('ASSIGNMENT_FLOW_FAIL', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
