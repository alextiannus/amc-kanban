import { runVoiceTask } from './brandVoiceProfiles'

const state = globalThis as typeof globalThis & { merchantVoiceTimer?: ReturnType<typeof setInterval>; merchantVoiceBusy?: boolean }
export function startVoiceTaskWorker() {
  if (state.merchantVoiceTimer) return
  const tick = async () => {
    if (state.merchantVoiceBusy) return
    state.merchantVoiceBusy = true
    try { await runVoiceTask() }
    catch (error) { console.warn('[merchant-voice-worker]', error instanceof Error ? error.message : 'Task failed') }
    finally { state.merchantVoiceBusy = false }
  }
  state.merchantVoiceTimer = setInterval(() => { void tick() }, 5000)
  state.merchantVoiceTimer.unref()
  void tick()
}
