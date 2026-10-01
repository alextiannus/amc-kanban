import {createHash} from 'node:crypto'

type DailyIdeaState = {
  plan_id?: string | null
  task_id?: string | null
  last_error?: string | null
  recovery_version?: string | null
}

export function isRecoverableDailyWait(status: unknown, waitingReason: unknown, usageComplete: boolean) {
  return status === 'waiting'
    && ['interrupted', 'limit'].includes(String(waitingReason || ''))
    && usageComplete
}

export function dailyRecoverySlots(rows: DailyIdeaState[], currentVersion: string, minimum = 6) {
  const fulfilledOrReserved = rows.filter((row) => (
    Boolean(row.plan_id)
    || Boolean(row.task_id) && !row.last_error
    || Boolean(row.task_id) && row.recovery_version === currentVersion
  )).length
  return Math.max(0, minimum - fulfilledOrReserved)
}

export function recoveryRequestKey(brandId: string, poolIdeaId: string, version: string) {
  const digest = createHash('sha256').update(JSON.stringify([brandId, poolIdeaId, version])).digest('hex')
  return `daily-recovery-v1-${digest}`
}
