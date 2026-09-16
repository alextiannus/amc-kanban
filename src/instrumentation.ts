import { installPerformanceLogging } from './lib/performance-log'

export async function register() {
  installPerformanceLogging('amc-kanban')
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { startVoiceTaskWorker } = await import('./lib/voiceTaskWorker')
    startVoiceTaskWorker()
    const { startAssetAnalysisWorker } = await import('./lib/asset-analysis/worker')
    startAssetAnalysisWorker()
    const { startImmediErpWorker } = await import('./lib/integrations/immediErpWorker')
    startImmediErpWorker()
  }
}
