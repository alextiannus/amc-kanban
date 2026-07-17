import crypto from 'crypto'
import { prisma } from './prisma.ts'
import { addCrewMember } from './user-management/crew.ts'

export const OVERFLOW_POLICIES = ['fallback_only', 'pending_queue', 'allow_soft_overflow'] as const
export const REBALANCE_POLICIES = ['manual_only', 'scheduled_daily'] as const
export const MATCHING_ORDERS = ['industry_first', 'region_first'] as const
export const SUBJECT_TYPES = ['user_register', 'brand_create', 'manual_reassign'] as const

export type OverflowPolicy = typeof OVERFLOW_POLICIES[number]
export type RebalancePolicy = typeof REBALANCE_POLICIES[number]
export type MatchingOrder = typeof MATCHING_ORDERS[number]
export type SubjectType = typeof SUBJECT_TYPES[number]

export class AssignmentError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

type ResolveInput = {
  subjectType: SubjectType
  subjectId: string
  industry?: string | null
  region?: string | null
  referenceCode?: string | null
  dryRun?: boolean
  idempotencyKey?: string | null
  createdBy?: 'system' | 'admin'
  actorId?: string | null
}

type ResolveResult = {
  selectedAgentId: string | null
  matchedBy: 'industry' | 'region' | 'fallback' | 'reference_code' | null
  reason: string
  overflowHandled: boolean
  fallbackUsed: boolean
  decisionId: string | null
}

type PoolMember = {
  agentId: string
  active: boolean
  capacity: number
  priority: number
  industries: string[]
  regions: string[]
  createdAt: Date
}

type AssignmentPoolConfigRecord = {
  id: string
  enabled: boolean
  overflowPolicy: OverflowPolicy
  rebalancePolicy: RebalancePolicy
  matchingOrder: MatchingOrder
  fallbackAgentId: string | null
}

const ASSIGNMENT_IDEMP_SCOPE = 'assignment_resolve'

function normalizeTag(value?: string | null): string | null {
  if (!value || typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  return normalized.length ? normalized : null
}

function sortObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortObjectKeys)
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortObjectKeys((value as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return value
}

function requestHash(input: Record<string, unknown>): string {
  const payload = JSON.stringify(sortObjectKeys(input))
  return crypto.createHash('sha256').update(payload).digest('hex')
}

function pickBestCandidate(candidates: Array<PoolMember & { currentLoad: number }>) {
  return [...candidates].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    if (a.currentLoad !== b.currentLoad) return a.currentLoad - b.currentLoad
    return a.createdAt.getTime() - b.createdAt.getTime()
  })[0] || null
}

async function getReferenceScopedAgentIds(referenceCode: string | null | undefined): Promise<string[] | null> {
  const normalized = normalizeTag(referenceCode)
  if (!normalized) return null

  const human = await prisma.user.findFirst({
    where: {
      type: 'HUMAN',
      OR: [{ id: normalized }, { email: normalized }],
    },
    select: { id: true },
  })
  if (!human) return null

  const agents = await prisma.user.findMany({
    where: { ownerId: human.id, type: 'AI_AGENT' },
    select: { id: true },
  })

  const agentIds = agents.map((a: any) => a.id)
  return agentIds.length ? agentIds : null
}

function toAssignmentPoolConfigRecord(value: unknown): AssignmentPoolConfigRecord {
  const obj = (value && typeof value === 'object') ? (value as Record<string, unknown>) : {}
  return {
    id: typeof obj.id === 'string' ? obj.id : 'default',
    enabled: obj.enabled !== false,
    overflowPolicy: (typeof obj.overflowPolicy === 'string' && OVERFLOW_POLICIES.includes(obj.overflowPolicy as OverflowPolicy))
      ? (obj.overflowPolicy as OverflowPolicy)
      : 'fallback_only',
    rebalancePolicy: (typeof obj.rebalancePolicy === 'string' && REBALANCE_POLICIES.includes(obj.rebalancePolicy as RebalancePolicy))
      ? (obj.rebalancePolicy as RebalancePolicy)
      : 'manual_only',
    matchingOrder: (typeof obj.matchingOrder === 'string' && MATCHING_ORDERS.includes(obj.matchingOrder as MatchingOrder))
      ? (obj.matchingOrder as MatchingOrder)
      : 'industry_first',
    fallbackAgentId: typeof obj.fallbackAgentId === 'string' ? obj.fallbackAgentId : null,
  }
}

async function getOrCreateConfigWithClient(client: {
  assignmentPoolConfig: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
    create: (args: {
      data: {
        id: string
        enabled: boolean
        overflowPolicy: OverflowPolicy
        rebalancePolicy: RebalancePolicy
        matchingOrder: MatchingOrder
      }
    }) => Promise<unknown>
  }
}) {
  const existing = await client.assignmentPoolConfig.findUnique({ where: { id: 'default' } })
  if (existing) return toAssignmentPoolConfigRecord(existing)

  const created = await client.assignmentPoolConfig.create({
    data: {
      id: 'default',
      enabled: true,
      overflowPolicy: 'fallback_only',
      rebalancePolicy: 'manual_only',
      matchingOrder: 'industry_first',
    },
  })

  return toAssignmentPoolConfigRecord(created)
}

export async function resolveAssignment(input: ResolveInput): Promise<ResolveResult> {
  const {
    subjectType,
    subjectId,
    industry,
    region,
    referenceCode,
    dryRun = false,
    idempotencyKey,
    createdBy = 'system',
    actorId = null,
  } = input

  if (!SUBJECT_TYPES.includes(subjectType)) {
    throw new AssignmentError('INVALID_SUBJECT_TYPE', 'Invalid subject type', 400)
  }
  if (!subjectId?.trim()) {
    throw new AssignmentError('INVALID_SUBJECT_ID', 'subjectId is required', 400)
  }

  const normalizedIndustry = normalizeTag(industry)
  const normalizedRegion = normalizeTag(region)
  const normalizedReferenceCode = normalizeTag(referenceCode)

  const baseHashInput = {
    subjectType,
    subjectId,
    industry: normalizedIndustry,
    region: normalizedRegion,
    referenceCode: normalizedReferenceCode,
    dryRun,
  }
  const payloadHash = requestHash(baseHashInput)

  return prisma.$transaction(async (tx: any) => {
    const config = await getOrCreateConfigWithClient(tx)

    if (!config.enabled) {
      throw new AssignmentError('ASSIGNMENT_POOL_DISABLED', 'Assignment pool is disabled', 409)
    }

    const idempotencyScope = `${ASSIGNMENT_IDEMP_SCOPE}:${subjectType}:${subjectId}`
    if (idempotencyKey && !dryRun) {
      const existingKey = await tx.idempotencyRecord.findUnique({
        where: { scope_key: { scope: idempotencyScope, key: idempotencyKey } },
      })

      if (existingKey && existingKey.expiresAt > new Date()) {
        if (existingKey.requestHash !== payloadHash) {
          throw new AssignmentError('IDEMPOTENCY_KEY_CONFLICT', 'Idempotency key conflict', 409)
        }

        const response = existingKey.response as ResolveResult | null
        if (response) return response
      }
    }

    const allActiveMembers = await tx.assignmentPoolMember.findMany({
      where: { active: true },
      select: {
        agentId: true,
        active: true,
        capacity: true,
        priority: true,
        industries: true,
        regions: true,
        createdAt: true,
      },
    })

    const activeAgentIds = allActiveMembers.map((m: any) => m.agentId)
    if (!activeAgentIds.length) {
      throw new AssignmentError('NO_ELIGIBLE_AGENT', 'No active pool member available', 409)
    }

    const liveAgents = await tx.user.findMany({
      where: {
        id: { in: activeAgentIds },
      },
      select: { id: true },
    })
    const liveAgentIdSet = new Set(liveAgents.map((a: any) => a.id))
    const activeMembers = allActiveMembers.filter((m: any) => liveAgentIdSet.has(m.agentId))

    if (!activeMembers.length) {
      throw new AssignmentError('NO_ELIGIBLE_AGENT', 'No active principal available in pool', 409)
    }

    const loadRows = await tx.brandOwner.groupBy({
      by: ['userId'],
      where: { brand: { status: 'ACTIVE' }, userId: { in: activeMembers.map((m: any) => m.agentId) } },
      _count: { _all: true },
    })
    const loadMap = new Map<string, number>(loadRows.map((r: any) => [r.userId, r._count._all]))

    const membersWithLoad = activeMembers.map((m: any) => ({
      ...m,
      currentLoad: loadMap.get(m.agentId) || 0,
    }))

    const referenceScopedAgentIds = await getReferenceScopedAgentIds(normalizedReferenceCode)
    const candidateBase = referenceScopedAgentIds?.length
      ? membersWithLoad.filter((m: any) => referenceScopedAgentIds.includes(m.agentId))
      : membersWithLoad

    const eligibleByCapacity = candidateBase.filter((m: any) => m.currentLoad < m.capacity)

    const withIndustry = normalizedIndustry
      ? eligibleByCapacity.filter((m: any) => m.industries.includes(normalizedIndustry))
      : []
    const withRegion = normalizedRegion
      ? eligibleByCapacity.filter((m: any) => m.regions.includes(normalizedRegion))
      : []

    let selected = null as (PoolMember & { currentLoad: number }) | null
    let matchedBy: ResolveResult['matchedBy'] = null
    let reason = 'no_match'
    let overflowHandled = false
    let fallbackUsed = false

    if (referenceScopedAgentIds?.length) {
      selected = pickBestCandidate(eligibleByCapacity)
      if (selected) {
        matchedBy = 'reference_code'
        reason = 'matched_by_reference_code'
      }
    }

    if (!selected) {
      const path: Array<{ key: 'industry' | 'region'; list: Array<PoolMember & { currentLoad: number }> }> =
        config.matchingOrder === 'region_first'
          ? [
              { key: 'region', list: withRegion },
              { key: 'industry', list: withIndustry },
            ]
          : [
              { key: 'industry', list: withIndustry },
              { key: 'region', list: withRegion },
            ]

      for (const step of path) {
        if (step.list.length) {
          selected = pickBestCandidate(step.list)
          matchedBy = step.key
          reason = `matched_by_${step.key}`
          break
        }
      }
    }

    if (!selected && eligibleByCapacity.length) {
      selected = pickBestCandidate(eligibleByCapacity)
      matchedBy = null
      reason = 'matched_by_priority_without_tag'
    }

    if (!selected) {
      if (config.overflowPolicy === 'allow_soft_overflow') {
        selected = pickBestCandidate(candidateBase)
        if (selected) {
          overflowHandled = true
          reason = 'matched_by_soft_overflow'
        }
      }
    }

    if (!selected) {
      if (config.overflowPolicy === 'pending_queue') {
        reason = 'queued_for_manual_assignment'
      } else if (config.fallbackAgentId) {
        const fallbackMember = membersWithLoad.find((m: any) => m.agentId === config.fallbackAgentId)
        if (fallbackMember) {
          selected = fallbackMember
          matchedBy = 'fallback'
          fallbackUsed = true
          reason = 'matched_by_fallback_agent'
        } else {
          throw new AssignmentError(
            'FALLBACK_AGENT_NOT_CONFIGURED',
            'Fallback agent is not active in assignment pool',
            409
          )
        }
      } else {
        throw new AssignmentError('FALLBACK_AGENT_NOT_CONFIGURED', 'Fallback agent is not configured', 409)
      }
    }

    if (!dryRun && selected) {
      if (subjectType === 'user_register') {
        const human = await tx.user.findUnique({ where: { id: subjectId }, select: { id: true, type: true } })
        if (!human || human.type !== 'HUMAN') {
          throw new AssignmentError('INVALID_SUBJECT_ID', 'user_register subject must be a HUMAN user id', 400)
        }

        await tx.user.update({
          where: { id: selected.agentId },
          data: { ownerId: subjectId },
        })
      } else {
        const brand = await tx.brand.findUnique({ where: { id: subjectId }, select: { id: true, status: true } })
        if (!brand || brand.status === 'ARCHIVED') {
          throw new AssignmentError('INVALID_SUBJECT_ID', 'brand subject must be an active brand id', 400)
        }

        await tx.brandAgent.upsert({
          where: {
            brandId_agentId: {
              brandId: subjectId,
              agentId: selected.agentId,
            },
          },
          create: {
            brandId: subjectId,
            agentId: selected.agentId,
            role: 'worker',
            active: true,
          },
          update: {
            active: true,
          },
        })

        await tx.brandOwner.upsert({
          where: {
            brandId_userId: {
              brandId: subjectId,
              userId: selected.agentId,
            },
          },
          create: {
            brandId: subjectId,
            userId: selected.agentId,
            role: 'collaborator',
          },
          update: {
            role: 'collaborator',
          },
        })

        // Also add to crew members if crew exists
        const crew = await tx.marketingCrew.findUnique({
          where: { brandId: subjectId },
          select: { id: true }
        })
        if (crew) {
          await addCrewMember(crew.id, selected.agentId, 'EDITOR', tx)
        }
      }
    }

    const decision = await tx.assignmentDecisionLog.create({
      data: {
        subjectType,
        subjectId,
        requestedIndustry: normalizedIndustry,
        requestedRegion: normalizedRegion,
        referenceCode: normalizedReferenceCode,
        matchedBy,
        selectedAgentId: selected?.agentId || null,
        reason,
        createdBy,
        overflowHandled,
        fallbackUsed,
        idempotencyKey: idempotencyKey || null,
      },
    })

    if (!dryRun && createdBy === 'admin') {
      await tx.auditLog.create({
        data: {
          actorId,
          actorType: 'HUMAN',
          action: 'AGENT_ASSIGNMENT_RESOLVED',
          resourceId: decision.id,
          resourceType: 'AssignmentDecisionLog',
          newValue: {
            subjectType,
            subjectId,
            selectedAgentId: selected?.agentId || null,
            matchedBy,
            overflowHandled,
            fallbackUsed,
          },
          reason,
        },
      })
    }

    const result: ResolveResult = {
      selectedAgentId: selected?.agentId || null,
      matchedBy,
      reason,
      overflowHandled,
      fallbackUsed,
      decisionId: decision.id,
    }

    if (idempotencyKey && !dryRun) {
      await tx.idempotencyRecord.upsert({
        where: {
          scope_key: {
            scope: idempotencyScope,
            key: idempotencyKey,
          },
        },
        create: {
          scope: idempotencyScope,
          key: idempotencyKey,
          requestHash: payloadHash,
          statusCode: 200,
          response: result,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
        update: {
          requestHash: payloadHash,
          statusCode: 200,
          response: result,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      })
    }

    return result
  })
}

export async function ensureAssignmentPoolConfig() {
  return getOrCreateConfigWithClient(prisma)
}
