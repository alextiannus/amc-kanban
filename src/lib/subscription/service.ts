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

  const existingBrandLink = await prisma.brandAgent.findFirst({
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

  // Reuse the owner's existing AI employee across brands whenever possible.
  // Subscription belongs to the AI employee identity, not a single brand.
  const ownerLinkedAgent = await prisma.user.findFirst({
    where: {
      type: 'AI_AGENT',
      assignedToHumans: {
        some: { humanId: ownerId },
      },
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      email: true,
      apiKey: true,
    },
  })

  let agentId = existingBrandLink?.agent.id || ownerLinkedAgent?.id
  let rawExistingApiKey = existingBrandLink?.agent.apiKey || ownerLinkedAgent?.apiKey || null

  if (!agentId) {
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } })
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `sub-${ownerId.slice(0, 12)}-${suffix}@agent.amc.local`

    const newAgent = await prisma.user.create({
      data: {
        email,
        password: crypto.randomBytes(16).toString('hex'),
        type: 'AI_AGENT',
        role: 'USER',
        nickname: `${brand?.name || 'Brand'} Subscription Agent`,
        apiKey: `placeholder-${crypto.randomUUID()}`,
      },
      select: { id: true, apiKey: true },
    })

    agentId = newAgent.id
    rawExistingApiKey = newAgent.apiKey
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

  // Ensure the reused/created AI employee can operate this brand as well.
  await prisma.brandAgent.upsert({
    where: {
      brandId_agentId: {
        brandId,
        agentId,
      },
    },
    create: {
      brandId,
      agentId,
      role: 'lead',
      active: true,
    },
    update: {
      active: true,
    },
  })

  const resolvedApiKey =
    rawExistingApiKey && !rawExistingApiKey.startsWith('placeholder-') ? rawExistingApiKey : null

  // Keep using the current key when agent already has a real key.
  if (resolvedApiKey) {
    return {
      agentId,
      apiKey: resolvedApiKey,
    }
  }

  // Generate a new key only if the AI employee has no usable key yet.
  const plaintextApiKey = await encrypt({ agentId, type: 'AI_AGENT' }, '36500d')

  await prisma.user.update({
    where: { id: agentId },
    data: { apiKey: plaintextApiKey },
  })

  return {
    agentId,
    apiKey: plaintextApiKey,
  }
}
