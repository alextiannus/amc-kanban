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
  ownerEmail: string           // REQUIRED: brand owner email — used to find/create brand owner account
  timezone?: string | null
  address?: string | null
  description?: string | null
}

export async function createBrandForActivatedSubscription(input: CreateBrandForSubscriptionInput) {
  const name = input.name.trim()
  if (!name) {
    return { ok: false as const, reason: 'name_required' as const }
  }

  const normalizedOwnerEmail = input.ownerEmail.trim().toLowerCase()
  if (!normalizedOwnerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedOwnerEmail)) {
    return { ok: false as const, reason: 'owner_email_required' as const }
  }

  const t0 = Date.now()
  const now = new Date()
  console.log(`[createBrand] start: name=${name}, ownerEmail=${normalizedOwnerEmail}`)

  const subscription = await prisma.brandSubscription.findFirst({
    where: {
      id: input.subscriptionId,
      // Note: allow PENDING and ACTIVE — for BILLING mode, brand is created while subscription is still PENDING
      OR: [{ contractEndDate: null }, { contractEndDate: { gt: now } }],
    },
    select: { id: true, brandId: true, planName: true },
  })
  console.log(`[createBrand] findFirst subscription (${Date.now() - t0}ms): found=${!!subscription}`)

  if (!subscription) {
    return { ok: false as const, reason: 'subscription_not_active' as const }
  }

  if (subscription.brandId) {
    const existingBrand = await prisma.brand.findUnique({ where: { id: subscription.brandId } })
    console.log(`[createBrand] existing brand check (${Date.now() - t0}ms): found=${!!existingBrand}`)
    if (!existingBrand) {
      return { ok: false as const, reason: 'brand_not_found' as const }
    }

    ensureBrandWorkspace(existingBrand.id).catch((workspaceError) => {
      console.error('[createBrand] existing workspace init failed:', workspaceError)
    })

    return { ok: true as const, brand: existingBrand, alreadyCreated: true as const, agentId: null }
  }

  console.log(`[createBrand] calling findOrCreateBrandOwnerAccount (${Date.now() - t0}ms)`)
  const brandOwner = await findOrCreateBrandOwnerAccount(normalizedOwnerEmail)
  console.log(`[createBrand] findOrCreateBrandOwnerAccount done (${Date.now() - t0}ms): ok=${brandOwner.ok}`)

  if (!brandOwner.ok) {
    return { ok: false as const, reason: 'brand_owner_not_found' as const }
  }

  const brandOwnerId = brandOwner.user.id

  console.log(`[createBrand] starting $transaction brand.create (${Date.now() - t0}ms)`)
  const result = await prisma.$transaction(async (tx: any) => {
    const existingBrand = await tx.brand.findFirst({
      where: {
        ownerId: brandOwnerId,
        name,
        status: 'ACTIVE',
      },
    })
    if (existingBrand) {
      await tx.brandSubscription.update({
        where: { id: input.subscriptionId },
        data: { brandId: existingBrand.id },
      })
      return { brand: existingBrand, alreadyCreated: true }
    }

    const created = await tx.brand.create({
      data: {
        ownerId: brandOwnerId,
        name,
        description: input.description?.trim() || null,
        location: input.location?.trim() || null,
        timezone: input.timezone || 'Asia/Singapore',
        address: input.address?.trim() || null,
        status: 'ACTIVE',
      },
    })

    await tx.brandSubscription.update({
      where: { id: input.subscriptionId },
      data: { brandId: created.id },
    })

    return { brand: created, alreadyCreated: false }
  })
  const brand = result.brand
  console.log(`[createBrand] $transaction done, brand.id=${brand.id}, alreadyCreated=${result.alreadyCreated} (${Date.now() - t0}ms)`)

  if (result.alreadyCreated) {
    ensureBrandWorkspace(brand.id).catch((workspaceError) => {
      console.error('[createBrand] existing workspace init failed:', workspaceError)
    })
    return { ok: true as const, brand, alreadyCreated: true as const, agentId: null }
  }

  // 4. Outside transaction: initialize crew and compatibility mappings
  try {
    console.log(`[createBrand] createMarketingCrew start (${Date.now() - t0}ms)`)
    const crew = await createMarketingCrew(brand.id)
    console.log(`[createBrand] createMarketingCrew done, crew.id=${crew.id} (${Date.now() - t0}ms)`)

    // Brand owner is NOT a crew member — they are the client/principal.
    // Only add the submitter (ownerId) to the crew if they are a different
    // person from the brand owner (e.g. an AMC staff member who created the
    // brand on behalf of the client).
    if (brandOwnerId !== input.ownerId) {
      console.log(`[createBrand] addCrewMember(submitter) start (${Date.now() - t0}ms)`)
      await addCrewMember(crew.id, input.ownerId, 'OWNER')
      console.log(`[createBrand] addCrewMember(submitter) done (${Date.now() - t0}ms)`)
    }

    console.log(`[createBrand] brandOwner.upsert start (${Date.now() - t0}ms)`)
    await prisma.brandOwner.upsert({
      where: { brandId_userId: { brandId: brand.id, userId: brandOwnerId } },
      create: { brandId: brand.id, userId: brandOwnerId, role: 'owner' },
      update: { role: 'owner' },
    })
    console.log(`[createBrand] brandOwner.upsert done (${Date.now() - t0}ms)`)

    console.log(`[createBrand] userBusinessRole.upsert start (${Date.now() - t0}ms)`)
    await prisma.userBusinessRole.upsert({
      where: { userId_role: { userId: brandOwnerId, role: 'BRAND_OWNER' } },
      create: { userId: brandOwnerId, role: 'BRAND_OWNER' },
      update: {},
    })
    console.log(`[createBrand] userBusinessRole.upsert done (${Date.now() - t0}ms)`)

    if (brandOwnerId !== input.ownerId) {
      await prisma.brandOwner.upsert({
        where: { brandId_userId: { brandId: brand.id, userId: input.ownerId } },
        create: { brandId: brand.id, userId: input.ownerId, role: 'collaborator' },
        update: { role: 'collaborator' },
      })
    }
  } catch (syncError) {
    console.error('[createBrand] Auxiliary mappings setup failed (non-fatal):', syncError)
  }

  console.log(`[createBrand] ensureBrandWorkspace (async, non-blocking) (${Date.now() - t0}ms)`)
  ensureBrandWorkspace(brand.id).catch((workspaceError) => {
    console.error('[createBrand] workspace init failed:', workspaceError)
  })

  console.log(`[createBrand] resolveAssignment (async, non-blocking) (${Date.now() - t0}ms)`)

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

  // Send congrats onboarding email with e-contract (non-blocking)
  const mmHost = process.env.NEXT_PUBLIC_MM_HOST || 'https://amc-mm.immedi.ai'
  prisma.user.findUnique({
    where: { id: brandOwner.user.id },
    select: { nickname: true }
  }).then((u: { nickname: string | null } | null) => {
    const finalNickname = u?.nickname || normalizedOwnerEmail.split('@')[0]
    import('@/lib/email').then(({ sendBrandCongratsEmailWithContract }) => {
      sendBrandCongratsEmailWithContract({
        to: normalizedOwnerEmail,
        nickname: finalNickname,
        brandName: brand.name,
        planName: subscription.planName,
        mmInviteLink: mmHost,
      }).then((res: any) => {
        console.log(`[createBrand] Onboarding email sent: success=${res.success}`)
      }).catch((err: any) => {
        console.error('[createBrand] Failed to send onboarding email:', err)
      })
    }).catch((importErr: any) => {
      console.error('[createBrand] Failed to import email lib:', importErr)
    })
  }).catch((dbErr: any) => {
    console.error('[createBrand] Failed to fetch user nickname for email:', dbErr)
  })

  return { ok: true as const, brand, alreadyCreated: false as const, agentId: null }
}
