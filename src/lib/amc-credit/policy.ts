export type AmcCreditPlan = 'starter' | 'essential' | 'booster'

export const AMC_CREDIT_BY_PLAN: Record<AmcCreditPlan, number> = {
  starter: 1_000,
  essential: 3_000,
  booster: 5_000,
}

export function normalizeCreditPlan(value: unknown): AmcCreditPlan {
  const plan = String(value || '').trim().toLowerCase()
  if (plan.includes('booster')) return 'booster'
  if (plan.includes('essential')) return 'essential'
  return 'starter'
}

export function creditForPlan(value: unknown): number {
  return AMC_CREDIT_BY_PLAN[normalizeCreditPlan(value)]
}

export function defaultCreditSettings(value: unknown = 'starter') {
  const planId = normalizeCreditPlan(value)
  return {
    planId,
    cycleAllowance: creditForPlan(planId),
    allowOverage: true,
    allowNightlyOverage: false,
  }
}

function daysInUtcMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

export function addBillingMonth(value: Date): Date {
  const year = value.getUTCFullYear()
  const month = value.getUTCMonth() + 1
  const day = Math.min(value.getUTCDate(), daysInUtcMonth(year + Math.floor(month / 12), month % 12))
  return new Date(Date.UTC(year + Math.floor(month / 12), month % 12, day, value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(), value.getUTCMilliseconds()))
}

function billingDate(anchor: Date, offset: number) {
  const absoluteMonth = anchor.getUTCMonth() + offset
  const year = anchor.getUTCFullYear() + Math.floor(absoluteMonth / 12)
  const month = ((absoluteMonth % 12) + 12) % 12
  const day = Math.min(anchor.getUTCDate(), daysInUtcMonth(year, month))
  return new Date(Date.UTC(year, month, day, anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds()))
}

export function cycleBounds(anchor: Date, at = new Date()): { startsAt: Date; endsAt: Date } {
  if (at < anchor) return { startsAt: new Date(anchor), endsAt: billingDate(anchor, 1) }
  for (let offset = 0; offset < 1_200; offset += 1) {
    const startsAt = billingDate(anchor, offset)
    const endsAt = billingDate(anchor, offset + 1)
    if (at < endsAt) return { startsAt, endsAt }
  }
  throw new Error('Billing cycle is more than 100 years from its anchor')
}

export type CreditLedgerLike = { kind: string; creditDelta: number }

export function summarizeCredit(includedCredit: number, entries: CreditLedgerLike[]) {
  const used = entries.filter(entry => ['SETTLE', 'CORRECTION'].includes(entry.kind)).reduce((sum, entry) => sum + entry.creditDelta, 0)
  const reserved = Math.max(0, entries.filter(entry => ['RESERVE', 'RELEASE'].includes(entry.kind)).reduce((sum, entry) => sum + entry.creditDelta, 0))
  const remaining = Math.max(0, includedCredit - used - reserved)
  const overage = Math.max(0, used + reserved - includedCredit)
  const usagePercent = includedCredit > 0 ? Math.round(((used + reserved) / includedCredit) * 10_000) / 100 : (used + reserved > 0 ? 100 : 0)
  return { includedCredit, used, reserved, remaining, overage, usagePercent }
}

export function canStartCreditTask(input: { allowOverage: boolean; includedCredit: number; entries: CreditLedgerLike[]; requestedCredit: number }) {
  if (!Number.isInteger(input.requestedCredit) || input.requestedCredit < 0) return false
  if (input.allowOverage) return true
  return summarizeCredit(input.includedCredit, input.entries).remaining >= input.requestedCredit
}

export function analysisCredit(taskType: string, rawUsage?: { durationSec?: number; inputTokens?: number; outputTokens?: number }) {
  if (taskType === 'asset_video_analysis') return Math.max(4, Math.ceil(Math.max(0, rawUsage?.durationSec || 0) / 10) + 3)
  if (taskType === 'asset_image_analysis') return 2
  if (taskType === 'asset_category_summary') return 1
  return Math.max(1, Math.ceil(((rawUsage?.inputTokens || 0) + (rawUsage?.outputTokens || 0)) / 2_000))
}
