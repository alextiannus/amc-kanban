import { installPerformanceLogging } from './lib/performance-log'

export async function register() {
  installPerformanceLogging('amc-kanban')
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Finish database/policy initialization before Next marks the instance ready.
    // No permission result is cached or reused for a user request.
    const { prisma } = await import('./lib/prisma')
    const { readPolicies } = await import('./lib/role-permissions/store')
    // Do not poison Next's cached instrumentation promise on a brief DB restart.
    // Keep the instance unready and workers stopped until authorization data is available.
    let attempts = 0
    for (;;) {
      try { await prisma.$connect(); await readPolicies(); break }
      catch (error) {
        const delay = Math.min(1000 * 2 ** Math.min(attempts++, 4), 15000)
        console.warn('[startup] database/policy initialization retry', { attempt: attempts, delayMs: delay, code: (error as {code?: string; errorCode?: string})?.code || (error as {errorCode?: string})?.errorCode || 'initialization_failed' })
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
    const { startNativeWorker } = await import('./lib/ai-native/service')
    startNativeWorker()
    const { startPlatformWorker } = await import('./lib/platform-ai/worker')
    startPlatformWorker()
    const { startIdeaPoolWorker } = await import('./lib/ai-native/idea-pool')
    startIdeaPoolWorker()
    const { startAutopilotWorker } = await import('./lib/ai-native/autopilot')
    startAutopilotWorker()
    const { startVoiceTaskWorker } = await import('./lib/voiceTaskWorker')
    startVoiceTaskWorker()
    const { startAssetAnalysisWorker } = await import('./lib/asset-analysis/worker')
    startAssetAnalysisWorker()
    const { startImmediErpWorker } = await import('./lib/integrations/immediErpWorker')
    startImmediErpWorker()
    const { startGoogleBrandImportWorker } = await import('./lib/googleBrandImport')
    startGoogleBrandImportWorker()
  }
}
