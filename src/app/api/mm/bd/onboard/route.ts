import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { hashPassword } from '@/lib/auth-v2'
import { sendBrandOnboardingWelcomeEmail } from '@/lib/email'
import { generateInvitationLink } from '@/lib/invitation'
import { buildBillingActivationData } from '@/lib/subscription/workflow'
import { SUBSCRIPTION_PLANS, calculatePricing, getAllowedDurationsForPlan } from '@/lib/subscription/catalog'
import { provisionPostfastKeyForBrand } from '@/lib/postfastKeyPool'
import { queueBrandGrowthSync, seedInitialBrandStores, syncBrandGrowthState } from '@/lib/brandGrowthSync'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Verify caller has BD or ADMIN role
  const userRoles = await prisma.userBusinessRole.findMany({
    where: { userId: session.user.id },
    select: { role: true }
  })
  const roles = userRoles.map((r: { role: string }) => r.role)
  const isBD = roles.includes('BD')
  const isAdmin = session.user.role === 'ADMIN'

  if (!isBD && !isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { merchantName, merchantEmail, brandName, planId } = body
    const initialStores = Array.isArray(body.stores) ? body.stores : body.store && typeof body.store === 'object' ? [body.store] : []

    if (!merchantName || !merchantEmail || !brandName || !planId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    if (!EMAIL_RE.test(String(merchantEmail).trim())) {
      return NextResponse.json({ error: 'Invalid merchant email format' }, { status: 400 })
    }

    const normalizedEmail = String(merchantEmail).trim().toLowerCase()

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })
    if (existingUser) {
      return NextResponse.json({ error: 'Merchant email already registered' }, { status: 409 })
    }

    // Use default password amc666666 for brand owner registration
    const tempPassword = 'amc666666'
    const hashedPassword = await hashPassword(tempPassword)

    // 3. Create User, Brand, BrandOwner and Subscription inside a transaction
    const result = await prisma.$transaction(async (tx: any) => {
      // A. Create Merchant User
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPassword,
          role: 'USER',
          type: 'HUMAN',
          nickname: String(merchantName).trim(),
          referredById: session.user.id,
          businessRoles: {
            create: { role: 'BRAND_OWNER' }
          }
        }
      })

      // B. Create Brand
      const brand = await tx.brand.create({
        data: {
          name: String(brandName).trim(),
          // Use default values for required brand fields
          owners: {
            create: {
              userId: user.id,
              role: 'owner'
            }
          }
        }
      })

      // C. Create Active Subscription Package
      const normalizedPlanId = planId === 'booster' ? 'booster' : 'essential'
      const selectedPlan = SUBSCRIPTION_PLANS.find(plan => plan.id === normalizedPlanId)
      if (!selectedPlan) {
        throw new Error('Invalid subscription plan')
      }
      const requestedDurationMonths = Number(body.durationMonths)
      const durationMonths = getAllowedDurationsForPlan(normalizedPlanId).includes(requestedDurationMonths)
        ? requestedDurationMonths
        : getAllowedDurationsForPlan(normalizedPlanId)[0]
      const pricing = calculatePricing(normalizedPlanId, durationMonths, [], {})
      const activationData = buildBillingActivationData(durationMonths)

      const subscription = await tx.brandSubscription.create({
        data: {
          planId: normalizedPlanId,
          planName: selectedPlan.name,
          durationMonths,
          billedMonths: pricing.billedMonths,
          monthlyBaseUsd: pricing.monthlyBaseUsd,
          recurringAddonsUsd: pricing.recurringAddonsUsd,
          oneTimeAddonsUsd: pricing.oneTimeAddonsUsd,
          totalDueUsd: pricing.totalDueUsd,
          brandId: brand.id,
          createdById: user.id,
          ...activationData,
          paidAt: new Date(),
        }
      })

      await provisionPostfastKeyForBrand({ brandId: brand.id, userId: user.id, tx })

      await queueBrandGrowthSync({
        brandId: brand.id,
        dirtyPaths: ['*'],
        mode: 'BACKFILL',
        actor: { id: session.user.id, email: session.user.email, type: session.user.type, roles },
        tx,
      })
      await seedInitialBrandStores(brand.id, initialStores, tx)

      return { user, brand, subscription }
    })

    syncBrandGrowthState(result.brand.id).catch(error => {
      console.error('[bd_onboard_api] Growth snapshot deferred:', error)
    })

    // 4. Send Welcome Onboarding Email (SMTP)
    const mmHost = process.env.NEXT_PUBLIC_MM_HOST || 'https://amc-mm.immedi.ai'
    let mmInviteLink = `${mmHost}/login`
    try {
      const { link } = generateInvitationLink(
        normalizedEmail,
        tempPassword,
        String(merchantName).trim(),
        mmHost,
        { expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 }
      )
      mmInviteLink = link
    } catch (e) {
      console.warn('[bd_onboard] Failed to generate secure login link, using fallback:', e)
    }

    try {
      await sendBrandOnboardingWelcomeEmail({
        to: normalizedEmail,
        nickname: String(merchantName).trim(),
        brandName: String(brandName).trim(),
        temporaryPassword: tempPassword,
        mmInviteLink,
        planName: result.subscription.planName
      })
    } catch (emailErr) {
      console.error('[bd_onboard_api] Welcome email send failed:', emailErr)
    }

    return NextResponse.json({
      success: true,
      merchantId: result.user.id,
      brandId: result.brand.id,
      subscriptionId: result.subscription.id
    })

  } catch (err: any) {
    console.error('[bd_onboard_api] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
