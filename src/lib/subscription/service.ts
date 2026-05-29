import { prisma } from '@/lib/prisma'

function addMonths(date: Date, months: number) {
  const next = new Date(date)
  next.setMonth(next.getMonth() + months)
  return next
}

export async function activateSubscriptionByPaymentSession(paymentSessionId: string) {
  const sub = await prisma.brandSubscription.findFirst({
    where: { paymentSessionId },
  })

  if (!sub) {
    return { ok: false as const, reason: 'not_found' as const }
  }

  if (sub.status === 'ACTIVE') {
    return { ok: true as const, subscription: sub, alreadyActive: true as const }
  }

  const now = new Date()
  const endDate = addMonths(now, sub.durationMonths)

  const updated = await prisma.brandSubscription.update({
    where: { id: sub.id },
    data: {
      status: 'ACTIVE',
      paidAt: sub.paidAt ?? now,
      contractStartDate: sub.contractStartDate ?? now,
      contractEndDate: sub.contractEndDate ?? endDate,
    },
  })

  return { ok: true as const, subscription: updated, alreadyActive: false as const }
}
