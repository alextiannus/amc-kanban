import assert from 'node:assert/strict'
import { addBillingMonth, analysisCredit, canStartCreditTask, creditForPlan, cycleBounds, defaultCreditSettings, summarizeCredit } from '../src/lib/amc-credit/policy.ts'

assert.equal(creditForPlan('starter'), 1000)
assert.equal(creditForPlan('Essential · 基础线上经营'), 3000)
assert.equal(creditForPlan('BOOSTER'), 5000)
assert.deepEqual(defaultCreditSettings('starter'), { planId: 'starter', cycleAllowance: 1000, allowOverage: true, allowNightlyOverage: false })
assert.equal(addBillingMonth(new Date('2026-01-31T00:00:00Z')).toISOString(), '2026-02-28T00:00:00.000Z')
assert.deepEqual(cycleBounds(new Date('2026-01-15T00:00:00Z'), new Date('2026-03-20T00:00:00Z')), { startsAt: new Date('2026-03-15T00:00:00Z'), endsAt: new Date('2026-04-15T00:00:00Z') })
const summary = summarizeCredit(1000, [{ kind: 'RESERVE', creditDelta: 200 }, { kind: 'RELEASE', creditDelta: -50 }, { kind: 'SETTLE', creditDelta: 900 }])
assert.deepEqual(summary, { includedCredit: 1000, used: 900, reserved: 150, remaining: 0, overage: 50, usagePercent: 105 })
assert.equal(canStartCreditTask({ allowOverage: false, includedCredit: 1000, entries: [{ kind: 'SETTLE', creditDelta: 900 }], requestedCredit: 101 }), false)
assert.equal(canStartCreditTask({ allowOverage: true, includedCredit: 1000, entries: [{ kind: 'SETTLE', creditDelta: 1000 }], requestedCredit: 300 }), true)
assert.equal(analysisCredit('asset_image_analysis'), 2)
assert.equal(analysisCredit('asset_video_analysis', { durationSec: 31 }), 7)
console.log('PASS AMC Credit policy: package amounts, default overage, billing cycles, ledger summary and task checks')
