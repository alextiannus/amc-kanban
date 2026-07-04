import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'
import { hashPassword } from '@/lib/auth-v2'
import { sendBrandOnboardingWelcomeEmail } from '@/lib/email'
import { generateInvitationLink } from '@/lib/invitation'

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

    // 2. Generate temporary password
    const tempPassword = Math.random().toString(36).substring(2, 10) + 'A1!'
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
      const planName = planId === 'premium' ? '尊享代运营钻石套餐' : '标准专业代运营套餐'
      const price = planId === 'premium' ? 999 : 499
      const contractEndDate = new Date()
      contractEndDate.setMonth(contractEndDate.getMonth() + 1) // default 1 month

      const subscription = await tx.brandSubscription.create({
        data: {
          planId,
          planName,
          durationMonths: 1,
          billedMonths: 1,
          monthlyBaseUsd: price,
          totalDueUsd: price,
          status: 'ACTIVE',
          brandId: brand.id,
          createdById: user.id,
          contractStartDate: new Date(),
          contractEndDate,
          paidAt: new Date()
        }
      })

      return { user, brand, subscription }
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
