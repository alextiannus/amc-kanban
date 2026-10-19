import {PLANNING_TEXT_TIMEOUT_MS} from '../global-text/deadline'
/** Shared by execution and the read-only runtime inspector; not a token quota. */
export const NATIVE_RUNTIME_LIMITS={maxTurns:40,maxCalls:48,maxBatchCalls:1,maxOutputBytes:128000,modelTimeoutMs:PLANNING_TEXT_TIMEOUT_MS+10000,taskTimeoutMs:600000} as const
