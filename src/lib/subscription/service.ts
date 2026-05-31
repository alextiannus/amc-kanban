import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/auth'
import crypto from 'crypto'

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

type EnsureBrandAgentKeyInput = {
  brandId: string
  ownerId: string
}

export async function ensureBrandAgentKeyAfterSubscription(input: EnsureBrandAgentKeyInput) {
  const { brandId, ownerId } = input

  const existingLink = await prisma.brandAgent.findFirst({
    where: { brandId, active: true },
    include: {
      agent: {
        select: {
          id: true,
          email: true,
          apiKey: true,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })

  let agentId = existingLink?.agent.id
  if (!agentId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `sub-${brandId.slice(0, 12)}-${suffix}@agent.amc.local`

    const newAgent = await prisma.user.create({
      data: {
        email,
        password: crypto.randomBytes(16).toString('hex'),
        type: 'AI_AGENT',
        role: 'USER',
        nickname: `${brand?.name || 'Brand'} Subscription Agent`,
        apiKey: `placeholder-${crypto.randomUUID()}`,
      },
      select: { id: true },
    })

    agentId = newAgent.id

    await prisma.brandAgent.create({
      data: {
        brandId,
        agentId,
        role: 'lead',
        active: true,
      },
    })
  }

  await prisma.agentPermission.upsert({
    where: {
      humanId_agentId: {
        humanId: ownerId,
        agentId,
      },
    },
    create: {
      humanId: ownerId,
      agentId,
    },
    update: {},
  })

  const plaintextApiKey = await encrypt({ agentId, type: 'AI_AGENT', brandId }, '36500d')

  await prisma.user.update({
    where: { id: agentId },
    data: { apiKey: plaintextApiKey },
  })

  return {
    agentId,
    apiKey: plaintextApiKey,
  }
}
