import { prisma } from './prisma.ts'

export async function checkAndRunTodoTasks() {
  console.log('=== Copywriter Scheduler: Checking for TODO tasks ===')
  try {
    const todoTasks = await prisma.workUnit.findMany({
      where: {
        status: 'todo',
        brandId: { not: null },
        assignee: {
          type: 'AI_AGENT'
        }
      }
    })

    console.log(`Copywriter Scheduler: Found ${todoTasks.length} TODO tasks assigned to AI agents.`)

    for (const task of todoTasks) {
      if (!task.brandId) continue
      console.log(`Copywriter Scheduler: Triggering marketingGraph for Brand: ${task.brandId}, Task: ${task.id} (${task.title})`)
      
      const config = { configurable: { thread_id: task.brandId } }
      const { marketingGraph } = await import('../agents/graph/marketingGraph.ts')
      
      void marketingGraph.invoke({
        taskId: task.id,
        brandId: task.brandId
      }, config).catch((err) => {
        console.error(`Copywriter Scheduler error during task ${task.id} invocation:`, err)
      })
    }
  } catch (error) {
    console.error('Copywriter Scheduler: Failed to check and run TODO tasks:', error)
  }
}

export function startCopywriterScheduler() {
  const globalForScheduler = global as unknown as { schedulerStarted?: boolean }

  if (globalForScheduler.schedulerStarted) {
    console.log('Copywriter Scheduler already started, skipping duplicate initialization.')
    return
  }

  globalForScheduler.schedulerStarted = true
  console.log('Copywriter Scheduler initializing...')

  // Run immediately on start
  void checkAndRunTodoTasks()

  // Run every 6 hours
  const SIX_HOURS = 6 * 60 * 60 * 1000
  const timer = setInterval(() => {
    void checkAndRunTodoTasks()
  }, SIX_HOURS)

  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }

  console.log('Copywriter Scheduler started successfully (runs every 6 hours).')
}
