import { prisma } from '@/lib/prisma'
import { encrypt } from '@/lib/auth'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'
import { findOrCreateBrandOwnerAccount } from '@/lib/brandOwnerAccount'
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

type CreateBrandForSubscriptionInput = {
  subscriptionId: string
  ownerId: string
  name: string
  location?: string | null
  ownerEmail?: string | null
  timezone?: string | null
  address?: string | null
}

export async function createBrandForActivatedSubscription(input: CreateBrandForSubscriptionInput) {
  const name = input.name.trim()
  if (!name) {
    return { ok: false as const, reason: 'name_required' as const }
  }

  const now = new Date()
  const subscription = await prisma.brandSubscription.findFirst({
    where: {
      id: input.subscriptionId,
      createdById: input.ownerId,
      status: 'ACTIVE',
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: now } }],
    },
    select: { id: true, brandId: true },
  })

  if (!subscription) {
    return { ok: false as const, reason: 'subscription_not_active' as const }
  }

  if (subscription.brandId) {
    const existingBrand = await prisma.brand.findUnique({ where: { id: subscription.brandId } })
    if (!existingBrand) {
      return { ok: false as const, reason: 'brand_not_found' as const }
    }

    const agentKey = await ensureBrandAgentKeyAfterSubscription({ ownerId: input.ownerId })
    await prisma.brandAgent.upsert({
      where: { brandId_agentId: { brandId: existingBrand.id, agentId: agentKey.agentId } },
      create: { brandId: existingBrand.id, agentId: agentKey.agentId, role: 'worker', active: true },
      update: { role: 'worker', active: true },
    })

    try {
      await ensureBrandWorkspace(existingBrand.id)
    } catch (workspaceError) {
      console.error('[createBrandForActivatedSubscription] existing workspace init failed:', workspaceError)
    }

    return { ok: true as const, brand: existingBrand, alreadyCreated: true as const, agentId: agentKey.agentId }
  }

  const normalizedOwnerEmail = input.ownerEmail?.trim().toLowerCase() || null
  const brandOwner = normalizedOwnerEmail ? await findOrCreateBrandOwnerAccount(normalizedOwnerEmail) : null

  if (brandOwner && !brandOwner.ok) {
    return { ok: false as const, reason: 'brand_owner_not_found' as const }
  }

  const brandOwnerId = brandOwner?.ok ? brandOwner.user.id : input.ownerId

  const brand = await prisma.$transaction(async (tx: any) => {
    const created = await tx.brand.create({
      data: {
        ownerId: brandOwnerId,
        name,
        location: input.location?.trim() || null,
        timezone: input.timezone || 'America/New_York',
        address: input.address?.trim() || null,
        status: 'ACTIVE',
      },
    })

    await tx.brandOwner.upsert({
      where: { brandId_userId: { brandId: created.id, userId: brandOwnerId } },
      create: { brandId: created.id, userId: brandOwnerId, role: 'owner' },
      update: { role: 'owner' },
    })

    await tx.userBusinessRole.upsert({
      where: { userId_role: { userId: brandOwnerId, role: 'BRAND_OWNER' } },
      create: { userId: brandOwnerId, role: 'BRAND_OWNER' },
      update: {},
    })

    if (brandOwnerId !== input.ownerId) {
      await tx.brandOwner.upsert({
        where: { brandId_userId: { brandId: created.id, userId: input.ownerId } },
        create: { brandId: created.id, userId: input.ownerId, role: 'collaborator' },
        update: { role: 'collaborator' },
      })
    }

    await tx.brandSubscription.update({
      where: { id: input.subscriptionId },
      data: { brandId: created.id },
    })

    return created
  })

  const agentKey = await ensureBrandAgentKeyAfterSubscription({ ownerId: input.ownerId })
  await prisma.brandAgent.upsert({
    where: { brandId_agentId: { brandId: brand.id, agentId: agentKey.agentId } },
    create: { brandId: brand.id, agentId: agentKey.agentId, role: 'worker', active: true },
    update: { role: 'worker', active: true },
  })

  try {
    await ensureBrandWorkspace(brand.id)
  } catch (workspaceError) {
    console.error('[createBrandForActivatedSubscription] workspace init failed:', workspaceError)
  }

  return { ok: true as const, brand, alreadyCreated: false as const, agentId: agentKey.agentId }
}

type EnsureBrandAgentKeyInput = {
  ownerId: string
}

export async function ensureBrandAgentKeyAfterSubscription(input: EnsureBrandAgentKeyInput) {
  const { ownerId } = input

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

  let agentId = ownerLinkedAgent?.id
  let rawExistingApiKey = ownerLinkedAgent?.apiKey || null

  if (!agentId) {
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    const email = `sub-${ownerId.slice(0, 12)}-${suffix}@agent.amc.local`

    const newAgent = await prisma.user.create({
      data: {
        email,
        password: crypto.randomBytes(16).toString('hex'),
        type: 'AI_AGENT',
        role: 'USER',
        nickname: 'Subscription Agent',
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
