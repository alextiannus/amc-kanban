import { prisma } from '@/lib/prisma'
import { ensureBrandWorkspace } from '@/lib/brandWorkspace'
import { findOrCreateBrandOwnerAccount } from '@/lib/brandOwnerAccount'
import { createMarketingCrew, addCrewMember } from '@/lib/user-management/crew'
import { resolveAssignment } from '@/lib/assignmentPool'

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
  description?: string | null
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

    ensureBrandWorkspace(existingBrand.id).catch((workspaceError) => {
      console.error('[createBrandForActivatedSubscription] existing workspace init failed:', workspaceError)
    })

    return { ok: true as const, brand: existingBrand, alreadyCreated: true as const, agentId: null }
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
        description: input.description?.trim() || null,
        location: input.location?.trim() || null,
        timezone: input.timezone || 'America/New_York',
        address: input.address?.trim() || null,
        status: 'ACTIVE',
      },
    })

    await tx.brandSubscription.update({
      where: { id: input.subscriptionId },
      data: { brandId: created.id },
    })

    return created
  })

  // 4. Outside transaction: initialize crew and compatibility mappings
  try {
    const crew = await createMarketingCrew(brand.id)
    await addCrewMember(crew.id, brandOwnerId)
    if (brandOwnerId !== input.ownerId) {
      await addCrewMember(crew.id, input.ownerId)
    }

    await prisma.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: brandOwnerId } },
      create: { brandId: brand.id, userId: brandOwnerId, role: 'owner' },
      update: { role: 'owner' },
    })

    await prisma.userBusinessRole.upsert({
      where: { userId_role: { userId: brandOwnerId, role: 'BRAND_OWNER' } },
      create: { userId: brandOwnerId, role: 'BRAND_OWNER' },
      update: {},
    })

    if (brandOwnerId !== input.ownerId) {
      await prisma.brandOwner.upsert({
        where: { brandId_userId: { brandId: brand.id, userId: input.ownerId } },
        create: { brandId: brand.id, userId: input.ownerId, role: 'collaborator' },
        update: { role: 'collaborator' },
      })
    }
  } catch (syncError) {
    console.error('[createBrandForActivatedSubscription] Auxiliary mappings setup failed (non-fatal):', syncError)
  }

  ensureBrandWorkspace(brand.id).catch((workspaceError) => {

    console.error('[createBrandForActivatedSubscription] workspace init failed:', workspaceError)
  })

  // Assign an AMC principal from the pool asynchronously
  resolveAssignment({
    subjectType: 'brand_create',
    subjectId: brand.id,
    industry: input.description || null,
    region: input.timezone || null,
    createdBy: 'system',
  }).then((result: any) => {
    console.log('[createBrandForActivatedSubscription] Background principal assignment succeeded:', result.selectedAgentId)
  }).catch((assignmentError: any) => {
    console.error('[createBrandForActivatedSubscription] Background principal assignment failed:', assignmentError)
  })

  return { ok: true as const, brand, alreadyCreated: false as const, agentId: null }
}
