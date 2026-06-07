#!/usr/bin/env node
import assert from 'node:assert/strict'
import { prisma } from '../src/lib/prisma.ts'
import { resolveAssignment } from '../src/lib/assignmentPool.ts'

async function main() {
  const agent = await prisma.user.findFirst({
    where: { type: 'AI_AGENT' },
    select: { id: true, email: true, nickname: true },
  })

  if (!agent) {
    console.log('NO_AGENT_FOR_SMOKE_TEST')
    return
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

  const dryRun = await resolveAssignment({
    subjectType: 'brand_create',
    subjectId: `smoke-brand-${Date.now()}`,
    industry: 'food',
    region: 'sg',
    dryRun: true,
    idempotencyKey: `smoke-${Date.now()}`,
    createdBy: 'system',
  })

  assert.equal(dryRun.selectedAgentId, agent.id)
  assert.ok(dryRun.decisionId)
  assert.equal(dryRun.matchedBy, 'industry')
  console.log('ASSIGNMENT_POOL_SMOKE_OK', JSON.stringify(dryRun))
}

main()
  .catch((error) => {
    console.error('ASSIGNMENT_POOL_SMOKE_FAIL', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
