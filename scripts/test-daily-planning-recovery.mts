import assert from 'node:assert/strict'
import {
  dailyRecoverySlots,
  isRecoverableDailyWait,
  recoveryRequestKey,
  shouldRetireDailyIdea,
} from '../src/lib/ai-native/daily-recovery.ts'

const version = 'current-version'

assert.equal(isRecoverableDailyWait('waiting', 'interrupted', true), true)
assert.equal(isRecoverableDailyWait('waiting', 'limit', true), true)
assert.equal(isRecoverableDailyWait('waiting', 'input', true), false)
assert.equal(isRecoverableDailyWait('waiting', 'external_result', true), false)
assert.equal(isRecoverableDailyWait('waiting', 'interrupted', false), false)
assert.equal(isRecoverableDailyWait('failed', 'interrupted', true), false)
assert.equal(shouldRetireDailyIdea('creative_direction_limit'), true)
assert.equal(shouldRetireDailyIdea('creative_subject_limit'), true)
assert.equal(shouldRetireDailyIdea('creative_duplicate'), true)
assert.equal(shouldRetireDailyIdea('daily_task_waiting'), false)

assert.equal(dailyRecoverySlots([
  {plan_id: 'plan-1'},
  {plan_id: 'plan-2'},
  {task_id: 'old-wait-1', last_error: 'daily_task_waiting'},
  {task_id: 'old-wait-2', last_error: 'daily_task_waiting'},
], version), 4)

assert.equal(dailyRecoverySlots([
  {plan_id: 'plan-1'},
  {plan_id: 'plan-2'},
  {task_id: 'recovery-1', recovery_version: version, last_error: 'daily_task_waiting'},
  {task_id: 'recovery-2', recovery_version: version, last_error: null},
  {task_id: 'old-wait', recovery_version: 'old-version', last_error: 'daily_task_waiting'},
], version), 2, 'current-version recoveries reserve target slots even before completion')

assert.equal(dailyRecoverySlots(Array.from({length: 6}, (_, index) => ({plan_id: `plan-${index}`})), version), 0)

const key = recoveryRequestKey('brand-a', 'pool-a', version)
assert.match(key, /^daily-recovery-v1-[a-f0-9]{64}$/)
assert.equal(key, recoveryRequestKey('brand-a', 'pool-a', version), 'same version must replay the same recovery request')
assert.notEqual(key, recoveryRequestKey('brand-a', 'pool-a', 'next-version'), 'a later application version may make one new recovery attempt')

console.log('PASS: daily recovery is settled-only, target-bounded and idempotent per application version')
