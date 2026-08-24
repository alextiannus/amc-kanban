export type MutableSubscriptionDates = {
  paidAt: Date | null
  contractStartDate: Date | null
  contractEndDate: Date | null
  durationMonths: number
  trialStartsAt?: Date | null
  trialEndsAt?: Date | null
  billingStartsAt?: Date | null
  feeWaived?: boolean | null
}

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'FAILED' | 'CANCELLED'

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export const DEFAULT_TRIAL_DAYS = 5

export function buildOfflineInvoiceResponse(params: {
  subscriptionId: string
  status: SubscriptionStatus
  totalDueUsd: number
}) {
  return {
    subscriptionId: params.subscriptionId,
    paymentMode: 'OFFLINE' as const,
    status: params.status,
    totalDueUsd: params.totalDueUsd,
    message: 'Offline invoice created. Please wait for admin payment confirmation.',
  }
}

export function buildBillingActivatedResponse(params: {
  subscriptionId: string
  totalDueUsd: number
  agentId: string | null
}) {
  return {
    subscriptionId: params.subscriptionId,
    paymentMode: 'BILLING' as const,
    status: 'ACTIVE' as const,
    totalDueUsd: params.totalDueUsd,
    agentId: params.agentId,
    message: 'Subscription activated immediately via billing mode.',
  }
}

export function buildBillingActivationData(durationMonths: number, now = new Date(), options?: { feeWaived?: boolean }) {
  const feeWaived = Boolean(options?.feeWaived)
  const trialStartsAt = feeWaived ? null : now
  const trialEndsAt = feeWaived ? null : addDays(now, DEFAULT_TRIAL_DAYS)
  return {
    status: 'ACTIVE' as SubscriptionStatus,
    paidAt: null,
    contractStartDate: now,
    contractEndDate: addMonths(now, durationMonths),
    trialStartsAt,
    trialEndsAt,
    billingStartsAt: feeWaived ? null : trialEndsAt,
    feeWaived,
  }
}

export function buildAdminStatusUpdateData(
  existing: MutableSubscriptionDates,
  status: SubscriptionStatus,
  now = new Date(),
  options?: { feeWaived?: boolean }
) {
  const shouldActivate = status === 'ACTIVE'
  const feeWaived = options?.feeWaived ?? Boolean(existing.feeWaived)
  const trialStartsAt = shouldActivate && !feeWaived ? existing.trialStartsAt ?? now : existing.trialStartsAt ?? null
  const trialEndsAt = shouldActivate && !feeWaived ? existing.trialEndsAt ?? addDays(now, DEFAULT_TRIAL_DAYS) : existing.trialEndsAt ?? null

  return {
    status,
    paidAt: shouldActivate ? existing.paidAt ?? now : existing.paidAt,
    contractStartDate: shouldActivate ? existing.contractStartDate ?? now : existing.contractStartDate,
    contractEndDate: shouldActivate
      ? existing.contractEndDate ?? addMonths(existing.contractStartDate ?? now, existing.durationMonths)
      : existing.contractEndDate,
    trialStartsAt,
    trialEndsAt,
    billingStartsAt: shouldActivate && !feeWaived ? existing.billingStartsAt ?? trialEndsAt : null,
    feeWaived,
  }
}
