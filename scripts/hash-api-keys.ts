import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

const prisma = new PrismaClient()

async function main() {
  console.log('Starting API key hashing migration...')

  const agents = await prisma.user.findMany({
    where: {
      type: 'AI_AGENT',
      apiKey: { not: null }
    }
  })

  let updatedCount = 0

  for (const agent of agents) {
    if (agent.apiKey) {
      // Check if it's already hashed (64 chars hex for sha256)
      const isHashed = /^[a-f0-9]{64}$/i.test(agent.apiKey)
      if (!isHashed) {
        const hashedKey = crypto.createHash('sha256').update(agent.apiKey).digest('hex')
        await prisma.user.update({
          where: { id: agent.id },
          data: { apiKey: hashedKey }
        })
        updatedCount++
        console.log(`Hashed API key for agent ${agent.email}`)
      } else {
        console.log(`API key for agent ${agent.email} is already hashed. Skipping.`)
      }
    }
  }

  console.log(`Migration complete. Updated ${updatedCount} agents.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
