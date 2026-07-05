import crypto from 'node:crypto'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

async function main() {
  const [
    users,
    explicitRoles,
    crews,
    crewMembers,
    brandOwners,
    brandAgents,
    agentPermissions,
    plaintextKeys,
    legacyAgentKeys,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userBusinessRole.count(),
    prisma.marketingCrew.count(),
    prisma.crewMember.count(),
    prisma.brandOwner.count(),
    prisma.brandAgent.count({ where: { active: true } }),
    prisma.agentPermission.count(),
    prisma.userApiKey.findMany({
      where: { token: { not: null } },
      select: { id: true, userId: true, token: true, tokenHash: true },
    }),
    prisma.user.findMany({
      where: { apiKey: { not: null } },
      select: { id: true, apiKey: true, type: true },
    }),
  ])

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    users,
    explicitRoles,
    crews,
    crewMembers,
    legacyRelations: { brandOwners, brandAgents, agentPermissions },
    plaintextUserApiKeys: plaintextKeys.length,
    legacyUserApiKeys: legacyAgentKeys.length,
  }, null, 2))

  if (!apply) {
    console.log('Dry run only. Re-run with --apply after the add-only Prisma migration is deployed.')
    return
  }

  let migratedUserKeys = 0
  for (const key of plaintextKeys) {
    if (!key.token) continue
    await prisma.userApiKey.update({
      where: { id: key.id },
      data: {
        tokenHash: key.tokenHash ?? hashToken(key.token),
        prefix: key.token.slice(0, 12),
        token: null,
      },
    })
    migratedUserKeys += 1
  }

  let migratedAgentKeys = 0
  for (const user of legacyAgentKeys) {
    if (!user.apiKey) continue
    const tokenHash = hashToken(user.apiKey)
    await prisma.userApiKey.upsert({
      where: { tokenHash },
      create: {
        userId: user.id,
        tokenHash,
        prefix: user.apiKey.slice(0, 12),
        name: 'Migrated legacy user API key',
      },
      update: { userId: user.id },
    })
    migratedAgentKeys += 1
  }

  console.log(JSON.stringify({
    migratedUserKeys,
    migratedAgentKeys,
    note: 'User.apiKey remains populated for rollback and must be cleared only after the stability window.',
  }, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
