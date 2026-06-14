import { prisma } from '../src/lib/prisma.ts'

async function main() {
  console.log('--- Querying all WorkUnits ---')
  const tasks = await prisma.workUnit.findMany({
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      createdAt: true
    }
  })

  console.log(`Total tasks: ${tasks.length}`)
  for (const task of tasks) {
    console.log(`- ID: ${task.id}, Status: ${task.status}, Title: "${task.title}", Created: ${task.createdAt.toISOString()}`)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
