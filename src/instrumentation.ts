import { installPerformanceLogging } from './lib/performance-log'

export async function register() {
  installPerformanceLogging('amc-kanban')
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    // Finish database/policy initialization before Next marks the instance ready.
    // No permission result is cached or reused for a user request.
    const { prisma } = await import('./lib/prisma')
    const { readPolicies } = await import('./lib/role-permissions/store')
    await prisma.$connect()
    await readPolicies()
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
