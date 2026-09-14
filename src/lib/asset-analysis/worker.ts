import { processAnalysisQueue } from './service'

const state = globalThis as typeof globalThis & { assetAnalysisTimer?: ReturnType<typeof setInterval>; assetAnalysisRunning?: boolean }
export function startAssetAnalysisWorker() {
  if (state.assetAnalysisTimer) return
  const tick = async () => {
    if (state.assetAnalysisRunning) return
    state.assetAnalysisRunning = true
    try { await processAnalysisQueue() } catch (error) { console.error('[Asset analysis worker]', error instanceof Error ? error.message : 'Failed') }
    finally { state.assetAnalysisRunning = false }
  }
  state.assetAnalysisTimer = setInterval(() => void tick(), 60_000)
  state.assetAnalysisTimer.unref()
  void tick()
}
