import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const tasks = await prisma.workUnit.findMany({
    orderBy: { createdAt: 'desc' }
  })
  
  console.log(`=== Total Tasks: ${tasks.length} ===`)
  
  // Show first 20 tasks
  for (const t of tasks.slice(0, 20)) {
    console.log(`Task ID: ${t.id}`)
    console.log(`  Title: "${t.title}"`)
    console.log(`  Status: ${t.status}`)
    console.log(`  RequiredInput: ${t.requiredInput}`)
    console.log(`  Materials: ${t.materials}`)
    console.log(`  Tags: ${JSON.stringify(t.tags)}`)
    console.log('------------------------------------')
  }
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect()
  })
