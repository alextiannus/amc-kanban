import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')
const fallbackOwnerByNickname = new Map([
  ['唐伯虎', { email: 'liwei@deliverychinatown.com', label: '唐伯虎 -> LiWei' }],
  ['孙尚香 ✨', { email: 'zhangyi@12eat.ai', label: '孙尚香 -> Zhangyi' }],
  ['孙尚香', { email: 'zhangyi@12eat.ai', label: '孙尚香 -> Zhangyi' }],
  ['李白', { email: 'alextiannus@gmail.com', label: '李白 -> Alex' }],
  ['小桥', { email: 'tianye@deliverychinatown.com', label: '小桥 -> 田野' }],
])

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function moveBrandAgentLinks(agentId, ownerId) {
  const links = await prisma.brandAgent.findMany({ where: { agentId } })
  for (const link of links) {
    await prisma.brandAgent.upsert({
      where: { brandId_agentId: { brandId: link.brandId, agentId: ownerId } },
      create: {
        brandId: link.brandId,
        agentId: ownerId,
        role: link.role,
        active: link.active,
      },
      update: {
        role: link.role,
        active: link.active,
      },
    })
  }
  await prisma.brandAgent.deleteMany({ where: { agentId } })
}

async function moveCrewMemberships(agentId, ownerId) {
  const memberships = await prisma.crewMember.findMany({ where: { userId: agentId } })
  for (const membership of memberships) {
    await prisma.crewMember.upsert({
      where: { crewId_userId: { crewId: membership.crewId, userId: ownerId } },
      create: {
        crewId: membership.crewId,
        userId: ownerId,
        role: membership.role,
        active: membership.active,
        source: 'MIGRATION',
      },
      update: {
        role: membership.role,
        active: membership.active,
      },
    })
  }
  await prisma.crewMember.deleteMany({ where: { userId: agentId } })
}

async function moveAssignmentPool(agentId, ownerId) {
  const member = await prisma.assignmentPoolMember.findUnique({ where: { agentId } })
  if (!member) return

  const existingOwnerMember = await prisma.assignmentPoolMember.findUnique({ where: { agentId: ownerId } })
  if (existingOwnerMember) {
    await prisma.assignmentPoolMember.delete({ where: { agentId } })
  } else {
    await prisma.assignmentPoolMember.update({ where: { agentId }, data: { agentId: ownerId } })
  }

  await prisma.assignmentPoolConfig.updateMany({
    where: { fallbackAgentId: agentId },
    data: { fallbackAgentId: ownerId },
  })
}

async function moveApiKeys(agent) {
  await prisma.userApiKey.updateMany({
    where: { userId: agent.id },
    data: { userId: agent.ownerId },
  })

  if (!agent.apiKey) return
  const token = agent.apiKey.replace(/^Bearer\s+/i, '').trim()
  if (!token) return
  const tokenHash = hashToken(token)
  await prisma.userApiKey.upsert({
    where: { tokenHash },
    create: {
      userId: agent.ownerId,
      tokenHash,
      prefix: token.slice(0, 12),
      name: `Migrated user key (${agent.nickname || agent.id})`,
    },
    update: {
      userId: agent.ownerId,
      token: null,
      prefix: token.slice(0, 12),
      name: `Migrated user key (${agent.nickname || agent.id})`,
    },
  })
}

async function migrateAgent(agent) {
  await moveApiKeys(agent)
  await moveCrewMemberships(agent.id, agent.ownerId)
  await moveBrandAgentLinks(agent.id, agent.ownerId)
  await moveAssignmentPool(agent.id, agent.ownerId)

  await prisma.workUnit.updateMany({ where: { assigneeId: agent.id }, data: { assigneeId: agent.ownerId } })
  await prisma.contentDraft.updateMany({ where: { agentId: agent.id }, data: { agentId: agent.ownerId } })
  await prisma.actionItem.updateMany({ where: { agentId: agent.id }, data: { agentId: agent.ownerId } })
  await prisma.schoolItem.updateMany({ where: { authorId: agent.id }, data: { authorId: agent.ownerId } })
  await prisma.agentPermission.deleteMany({ where: { OR: [{ agentId: agent.id }, { humanId: agent.id }] } })

  await prisma.user.update({
    where: { id: agent.id },
    data: {
      type: 'HUMAN',
      status: 'DISABLED',
      apiKey: null,
      ownerId: null,
      authVersion: { increment: 1 },
    },
  })
}

async function main() {
  const rawAgents = await prisma.user.findMany({
    where: { type: 'AI_AGENT' },
    select: {
      id: true,
      email: true,
      nickname: true,
      ownerId: true,
      apiKey: true,
      owner: { select: { id: true, email: true, status: true } },
      apiKeys: { select: { id: true, prefix: true, name: true, revokedAt: true } },
      crewMemberships: { select: { id: true } },
      brandMemberships: { select: { id: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const agents = []
  for (const agent of rawAgents) {
    let mappedOwner = agent.owner
    let mappedOwnerId = agent.ownerId
    let fallbackOwnerLabel = null

    if (!mappedOwnerId && agent.nickname) {
      const fallback = fallbackOwnerByNickname.get(agent.nickname)
      if (fallback) {
        const owner = await prisma.user.findFirst({
          where: { email: fallback.email, type: 'HUMAN', status: 'ACTIVE' },
          select: { id: true, email: true, status: true },
        })
        if (owner) {
          mappedOwner = owner
          mappedOwnerId = owner.id
          fallbackOwnerLabel = fallback.label
        }
      }
    }

    agents.push({
      ...agent,
      owner: mappedOwner,
      ownerId: mappedOwnerId,
      fallbackOwnerLabel,
    })
  }

  const blocked = agents.filter((agent) => !agent.ownerId || !agent.owner)
  const summary = agents.map((agent) => ({
    agent_id: agent.id,
    agent_email: agent.email,
    nickname: agent.nickname,
    owner_id: agent.ownerId,
    owner_email: agent.owner?.email ?? null,
    owner_status: agent.owner?.status ?? null,
    fallback_owner_mapping: agent.fallbackOwnerLabel,
    user_api_keys: agent.apiKeys.length,
    has_legacy_user_api_key: Boolean(agent.apiKey),
    crew_memberships: agent.crewMemberships.length,
    brand_agent_links: agent.brandMemberships.length,
    action: agent.ownerId && agent.owner ? 'move keys and runtime ownership to owner, then disable legacy user' : 'blocked: missing owner',
  }))

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    ai_agent_users_found: agents.length,
    blocked: blocked.length,
    summary,
  }, null, 2))

  if (!apply) {
    console.log('Dry run only. Re-run with --apply after reviewing the owner mappings.')
    return
  }

  if (blocked.length > 0) {
    throw new Error(`Refusing to apply: ${blocked.length} AI_AGENT user(s) do not have a bound human owner.`)
  }

  for (const agent of agents) {
    await migrateAgent({
      id: agent.id,
      email: agent.email,
      nickname: agent.nickname,
      ownerId: agent.ownerId,
      apiKey: agent.apiKey,
    })
  }

  const remaining = await prisma.user.count({ where: { type: 'AI_AGENT' } })
  console.log(JSON.stringify({
    migrated: agents.length,
    remaining_ai_agent_users: remaining,
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
