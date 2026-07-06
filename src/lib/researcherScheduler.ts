import { runDailySnapshotCrawler } from './captureSnapshots.ts'

export function startResearcherScheduler() {
  const globalForScheduler = global as unknown as { researcherSchedulerStarted?: boolean }

  if (globalForScheduler.researcherSchedulerStarted) {
    console.log('Researcher Scheduler already started, skipping duplicate initialization.')
    return
  }

  globalForScheduler.researcherSchedulerStarted = true
  console.log('Researcher Scheduler initializing...')

  // Run daily (every 24 hours)
  const DAILY_INTERVAL = 24 * 60 * 60 * 1000
  const timer = setInterval(() => {
    console.log('=== Researcher Scheduler: Running daily snapshot crawler ===')
    void runDailySnapshotCrawler().catch((err) => {
      console.error('Researcher Scheduler: Failed to run daily snapshots:', err)
    })
  }, DAILY_INTERVAL)

  if (timer && typeof timer.unref === 'function') {
    timer.unref()
  }

  console.log('Researcher Scheduler started successfully (runs every 24 hours).')
}
