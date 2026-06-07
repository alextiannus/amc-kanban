#!/usr/bin/env node
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { prisma } from '../src/lib/prisma.ts'
import { AssignmentError, resolveAssignment } from '../src/lib/assignmentPool.ts'
import { isAmcOperator, isAmcOperatorRole } from '../src/lib/amcOperator.ts'

function rid(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
}

async function main() {
  const testIndustry = `phase1-ind-${Date.now()}`
  const testRegion = `phase1-reg-${Date.now()}`
  const testPassword = 'Phase1E2E!123'

  const createdUserIds: string[] = []
  const createdBrandIds: string[] = []

  const previousConfig = await prisma.assignmentPoolConfig.findUnique({ where: { id: 'default' } })

  try {
    // Phase 1 mapping: HUMAN + ADMIN => AMC operator.
    assert.equal(isAmcOperator({ type: 'HUMAN', role: 'ADMIN' }), true)
    assert.equal(isAmcOperator({ type: 'AI_AGENT', role: 'ADMIN' }), false)
    assert.equal(isAmcOperatorRole('ADMIN'), true)
    assert.equal(isAmcOperatorRole('USER'), false)

    const agentPrimary = await prisma.user.create({
      data: {
        email: `${rid('phase1-agent-primary')}@example.com`,
        password: testPassword,
        type: 'AI_AGENT',
        role: 'USER',
        nickname: rid('phase1-agent-primary'),
      },
      select: { id: true },
    })
    createdUserIds.push(agentPrimary.id)

    const agentFallback = await prisma.user.create({
      data: {
        email: `${rid('phase1-agent-fallback')}@example.com`,
        password: testPassword,
        type: 'AI_AGENT',
        role: 'USER',
        nickname: rid('phase1-agent-fallback'),
      },
      select: { id: true },
    })
    createdUserIds.push(agentFallback.id)

    await prisma.assignmentPoolConfig.upsert({
      where: { id: 'default' },
      create: {
        id: 'default',
        enabled: true,
        overflowPolicy: 'fallback_only',
        rebalancePolicy: 'manual_only',
        matchingOrder: 'industry_first',
        fallbackAgentId: agentFallback.id,
      },
      update: {
        enabled: true,
        overflowPolicy: 'fallback_only',
        rebalancePolicy: 'manual_only',
        matchingOrder: 'industry_first',
        fallbackAgentId: agentFallback.id,
      },
    })

    await prisma.assignmentPoolMember.upsert({
      where: { agentId: agentPrimary.id },
      create: {
        agentId: agentPrimary.id,
        active: true,
        capacity: 30,
        priority: 100,
        industries: [testIndustry],
        regions: [testRegion],
      },
      update: {
        active: true,
        capacity: 30,
        priority: 100,
        industries: [testIndustry],
        regions: [testRegion],
      },
    })

    await prisma.assignmentPoolMember.upsert({
      where: { agentId: agentFallback.id },
      create: {
        agentId: agentFallback.id,
        active: true,
        capacity: 30,
        priority: 80,
        industries: [],
        regions: [],
      },
      update: {
        active: true,
        capacity: 30,
        priority: 80,
        industries: [],
        regions: [],
      },
    })

    // user_register flow + idempotency replay
    const human = await prisma.user.create({
      data: {
        email: `${rid('phase1-human')}@example.com`,
        password: testPassword,
        type: 'HUMAN',
        role: 'USER',
      },
      select: { id: true },
    })
    createdUserIds.push(human.id)

    const idemKey = rid('phase1-idem-user')
    const userFirst = await resolveAssignment({
      subjectType: 'user_register',
      subjectId: human.id,
      industry: testIndustry,
      region: testRegion,
      idempotencyKey: idemKey,
      dryRun: false,
      createdBy: 'system',
    })
    const userSecond = await resolveAssignment({
      subjectType: 'user_register',
      subjectId: human.id,
      industry: testIndustry,
      region: testRegion,
      idempotencyKey: idemKey,
      dryRun: false,
      createdBy: 'system',
    })

    assert.equal(userFirst.selectedAgentId, agentPrimary.id)
    assert.equal(userSecond.selectedAgentId, agentPrimary.id)
    assert.equal(userFirst.decisionId, userSecond.decisionId)

    const permission = await prisma.agentPermission.findUnique({
      where: { humanId_agentId: { humanId: human.id, agentId: agentPrimary.id } },
    })
    assert.ok(permission)

    // idempotency conflict
    let conflictRaised = false
    try {
      await resolveAssignment({
        subjectType: 'user_register',
        subjectId: human.id,
        industry: `${testIndustry}-mismatch`,
        region: testRegion,
        idempotencyKey: idemKey,
        dryRun: false,
        createdBy: 'system',
      })
    } catch (error) {
      conflictRaised = true
      assert.ok(error instanceof AssignmentError)
      assert.equal((error as AssignmentError).code, 'IDEMPOTENCY_KEY_CONFLICT')
    }
    assert.equal(conflictRaised, true)

    // brand_create flow
    const brand = await prisma.brand.create({
      data: { name: rid('phase1-brand'), timezone: 'Asia/Singapore', status: 'ACTIVE' },
      select: { id: true },
    })
    createdBrandIds.push(brand.id)

    const brandDecision = await resolveAssignment({
      subjectType: 'brand_create',
      subjectId: brand.id,
      industry: testIndustry,
      region: testRegion,
      dryRun: false,
      createdBy: 'system',
    })
    assert.equal(brandDecision.selectedAgentId, agentPrimary.id)

    const brandLink = await prisma.brandAgent.findUnique({
      where: { brandId_agentId: { brandId: brand.id, agentId: agentPrimary.id } },
    })
    assert.ok(brandLink?.active)

    // archived brand should not be assignable
    const archivedBrand = await prisma.brand.create({
      data: { name: rid('phase1-brand-archived'), timezone: 'Asia/Singapore', status: 'ARCHIVED' },
      select: { id: true },
    })
    createdBrandIds.push(archivedBrand.id)

    let archivedRejected = false
    try {
      await resolveAssignment({
        subjectType: 'brand_create',
        subjectId: archivedBrand.id,
        industry: testIndustry,
        region: testRegion,
        dryRun: false,
        createdBy: 'system',
      })
    } catch (error) {
      archivedRejected = true
      assert.ok(error instanceof AssignmentError)
      assert.equal((error as AssignmentError).code, 'INVALID_SUBJECT_ID')
    }
    assert.equal(archivedRejected, true)

    // soft-deleted/invalid AI agent should not be selected
    await prisma.user.update({ where: { id: agentPrimary.id }, data: { type: 'HUMAN' } })
    const afterSoftDelete = await resolveAssignment({
      subjectType: 'manual_reassign',
      subjectId: rid('phase1-subject'),
      industry: testIndustry,
      region: testRegion,
      dryRun: true,
      createdBy: 'system',
    })
    assert.notEqual(afterSoftDelete.selectedAgentId, agentPrimary.id)

    console.log('PHASE1_E2E_OK', JSON.stringify({
      mappedAdmin: true,
      userDecisionId: userFirst.decisionId,
      brandDecisionId: brandDecision.decisionId,
      idempotencyConflict: true,
      archivedBrandRejected: true,
      softDeletedAgentExcluded: true,
    }))
  } finally {
    for (const brandId of createdBrandIds) {
      await prisma.brandAgent.deleteMany({ where: { brandId } })
      await prisma.brandOwner.deleteMany({ where: { brandId } })
      await prisma.assignmentDecisionLog.deleteMany({ where: { subjectId: brandId } })
      await prisma.brand.deleteMany({ where: { id: brandId } })
    }

    for (const userId of createdUserIds) {
      await prisma.agentPermission.deleteMany({ where: { OR: [{ humanId: userId }, { agentId: userId }] } })
      await prisma.assignmentPoolMember.deleteMany({ where: { agentId: userId } })
      await prisma.brandAgent.deleteMany({ where: { agentId: userId } })
      await prisma.assignmentDecisionLog.deleteMany({ where: { subjectId: userId } })
      await prisma.user.deleteMany({ where: { id: userId } })
    }

    if (previousConfig) {
      await prisma.assignmentPoolConfig.update({
        where: { id: 'default' },
        data: {
          enabled: previousConfig.enabled,
          overflowPolicy: previousConfig.overflowPolicy,
          rebalancePolicy: previousConfig.rebalancePolicy,
          matchingOrder: previousConfig.matchingOrder,
          fallbackAgentId: previousConfig.fallbackAgentId,
          updatedById: previousConfig.updatedById,
        },
      })
    }
  }
}

main()
  .catch((error) => {
    console.error('PHASE1_E2E_FAIL', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
