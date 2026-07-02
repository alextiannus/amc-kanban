export type MutableSubscriptionDates = {
  paidAt: Date | null
  contractStartDate: Date | null
  contractEndDate: Date | null
  durationMonths: number
}

export type SubscriptionStatus = 'PENDING' | 'ACTIVE' | 'FAILED' | 'CANCELLED'

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

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

export function buildBillingActivationData(durationMonths: number, now = new Date()) {
  return {
    status: 'ACTIVE' as SubscriptionStatus,
    paidAt: null,
    contractStartDate: now,
    contractEndDate: addMonths(now, durationMonths),
  }
}

export function buildAdminStatusUpdateData(
  existing: MutableSubscriptionDates,
  status: SubscriptionStatus,
  now = new Date()
) {
  const shouldActivate = status === 'ACTIVE'

  return {
    status,
    paidAt: shouldActivate ? existing.paidAt ?? now : existing.paidAt,
    contractStartDate: shouldActivate ? existing.contractStartDate ?? now : existing.contractStartDate,
    contractEndDate: shouldActivate
      ? existing.contractEndDate ?? addMonths(existing.contractStartDate ?? now, existing.durationMonths)
      : existing.contractEndDate,
  }
}