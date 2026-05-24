import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { timestamp: 'desc' },
    take: 50
  })
  
  console.log(`=== Total Audit Logs (recent 50): ${logs.length} ===`)
  for (const l of logs) {
    console.log(`[${l.timestamp.toISOString()}] Actor: ${l.actorName} (${l.actorType})`)
    console.log(`  Action: ${l.action}`)
    console.log(`  Resource: ${l.resourceType} (ID: ${l.resourceId})`)
    console.log(`  Old: ${JSON.stringify(l.oldValue)}`)
    console.log(`  New: ${JSON.stringify(l.newValue)}`)
    console.log(`  Reason: ${l.reason}`)
    console.log(`  Metadata: ${JSON.stringify(l.metadata)}`)
    console.log('------------------------------------')
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
