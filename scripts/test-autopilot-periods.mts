import assert from 'node:assert/strict'
import {autopilotPeriodKey} from '../src/lib/ai-native/autopilot.ts'

const singapore='Asia/Singapore'
assert.equal(autopilotPeriodKey(singapore,'daily',new Date('2026-11-12T03:00:00Z')),'2026-11-12')
assert.equal(autopilotPeriodKey(singapore,'monthly',new Date('2026-11-30T20:00:00Z')),'2026-12')
assert.equal(autopilotPeriodKey(singapore,'weekly',new Date('2026-11-12T03:00:00Z')),'2026-W46')
assert.equal(autopilotPeriodKey(singapore,'weekly',new Date('2027-01-01T03:00:00Z')),'2026-W53')
assert.equal(autopilotPeriodKey(singapore,'weekly',new Date('2027-01-04T03:00:00Z')),'2027-W01')
console.log('PASS: daily, ISO-week and monthly goal periods respect the brand timezone')
