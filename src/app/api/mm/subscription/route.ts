import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Stripe from 'stripe'
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_ADDONS, DEFAULT_SUBSCRIPTION_TERMS_VERSION, calculatePricing } from '@/lib/subscription/catalog'
import { buildOfflineInvoiceResponse, buildBillingActivatedResponse, buildBillingActivationData } from '@/lib/subscription/workflow'
import { createBrandForActivatedSubscription, ensureBrandAgentKeyAfterSubscription } from '@/lib/subscription/service'
import { sendSubscriptionSuccessEmail } from '@/lib/email'

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

export async function POST(request: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (session.user.type === 'AI_AGENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const body = await request.json()
    const url = new URL(request.url)
    const queryBrandId = url.searchParams.get('brandId')
    const rawBrandId = String(body.brandId ?? queryBrandId ?? '').trim()
    const brandId = rawBrandId || null

    const pendingBrandName = String(body.pendingBrandName ?? '').trim()
    const pendingBrandLocation = String(body.pendingBrandLocation ?? '').trim()
    const pendingBrandAddress = String(body.pendingBrandAddress ?? '').trim()
    const pendingBrandOwnerEmail = String(body.pendingBrandOwnerEmail ?? '').trim().toLowerCase()
    const pendingBrandTimezone = String(body.timezone ?? '').trim() || 'America/New_York'
    const pendingBrandDescription = String(body.pendingBrandDescription ?? '').trim()

    if (brandId && pendingBrandName) {
      return NextResponse.json({ error: 'brandId and pendingBrandName cannot be used together' }, { status: 400 })
    }

    if (brandId) {
      const exists = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    const planId = String(body.planId ?? 'starter')
    const durationMonths = Number(body.durationMonths || 1)
    const promoCode = body.promoCode ? String(body.promoCode).trim().toUpperCase() : undefined
    const addonIds: string[] = Array.isArray(body.addonIds) ? body.addonIds.map((v: unknown) => String(v)) : []
    const uniqueAddonIds: string[] = Array.from(new Set(addonIds))
    const rawMode = body.paymentMode ?? body.paymentMethod
    const paymentMode: 'ONLINE' | 'OFFLINE' | 'BILLING' =
      rawMode === 'OFFLINE' ? 'OFFLINE' : rawMode === 'BILLING' ? 'BILLING' : 'ONLINE'
    
    const agreedToTerms = true // Auto-agree to terms for mobile app flow
    const termsVersion = DEFAULT_SUBSCRIPTION_TERMS_VERSION

    const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
    if (!selectedPlan) return NextResponse.json({ error: 'Invalid planId' }, { status: 400 })

    const invalidAddonIds = uniqueAddonIds.filter((id) => !SUBSCRIPTION_ADDONS.some((a) => a.id === id))
    if (invalidAddonIds.length > 0) {
      return NextResponse.json({ error: `Invalid addonIds: ${invalidAddonIds.join(', ')}` }, { status: 400 })
    }

    const addonQuantities: Record<string, number> = {}
    if (body.addonQuantities && typeof body.addonQuantities === 'object') {
      for (const [key, val] of Object.entries(body.addonQuantities)) {
        const num = Number(val)
        if (!isNaN(num) && num >= 0) {
          addonQuantities[key] = num
        }
      }
    }

    const summary = calculatePricing(planId, durationMonths, uniqueAddonIds, addonQuantities)
    const selectedAddons = SUBSCRIPTION_ADDONS.filter((a: any) => uniqueAddonIds.includes(a.id)).map((addon: any) => ({
      ...addon,
      quantity: addon.id === 'multi_store' ? (addonQuantities['multi_store'] ?? 0) : 1,
    }))

    // Resolve promo code / invite code
    let finalReferredById: string | null = null
    let campaignId: string | null = null
    let promoDiscountAmount = 0
    let promoCodeType: string | null = null

    if (promoCode) {
      const campaign = await prisma.campaignPromoCode.findUnique({
        where: { code: promoCode }
      })
      if (campaign && campaign.isActive && (!campaign.expiresAt || new Date(campaign.expiresAt) > new Date()) && (campaign.maxUses === null || campaign.usedCount < campaign.maxUses)) {
        campaignId = campaign.id
        finalReferredById = campaign.ownerId
        promoCodeType = 'CAMPAIGN_PROMO'
        if (campaign.discountType === 'PERCENT') {
          promoDiscountAmount = summary.totalDueUsd * (campaign.discountValue / 100)
        } else {
          promoDiscountAmount = campaign.discountValue * durationMonths
        }
      } else {
        const userReferrer = await prisma.user.findUnique({
          where: { inviteCode: promoCode }
        })
        if (userReferrer && userReferrer.id !== session.user.id) {
          finalReferredById = userReferrer.id
          promoCodeType = 'USER_INVITE'
          promoDiscountAmount = summary.totalDueUsd * 0.10
        }
      }
    }

    const finalTotalDue = Math.max(0, Math.round(summary.totalDueUsd - promoDiscountAmount))

    const pendingSub = await prisma.brandSubscription.create({
      data: {
        brandId,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        durationMonths: summary.durationMonths,
        billedMonths: summary.billedMonths,
        monthlyBaseUsd: summary.monthlyBaseUsd,
        recurringAddonsUsd: summary.recurringAddonsUsd,
        oneTimeAddonsUsd: summary.oneTimeAddonsUsd,
        totalDueUsd: finalTotalDue,
        status: 'PENDING',
        paymentProvider: paymentMode === 'ONLINE' ? 'STRIPE' : paymentMode,
        selectedAddons: selectedAddons as unknown as Prisma.InputJsonValue,
        termsVersion,
        termsAcceptedAt: new Date(),
        createdById: session.user.id,
      },
    })

    if (campaignId) {
      await prisma.campaignPromoCode.update({
        where: { id: campaignId },
        data: { usedCount: { increment: 1 } }
      })
    }

    let targetUserId = session.user.id
    if (brandId) {
      const brandObj = await prisma.brand.findUnique({
        where: { id: brandId },
        select: { ownerId: true }
      })
      if (brandObj?.ownerId) targetUserId = brandObj.ownerId
    }

    if (finalReferredById) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { referredById: true }
      })
      if (targetUser && !targetUser.referredById) {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { referredById: finalReferredById }
        })
      }
    }

    if (promoCodeType) {
      await prisma.promoCodeUsage.create({
        data: {
          userId: targetUserId,
          codeUsed: promoCode || '',
          codeType: promoCodeType,
          referredById: promoCodeType === 'USER_INVITE' ? finalReferredById : null,
          campaignCodeId: promoCodeType === 'CAMPAIGN_PROMO' ? campaignId : null,
          subscriptionId: pendingSub.id,
          discountAmount: Math.round(promoDiscountAmount)
        }
      })
    }

    if (paymentMode === 'BILLING') {
      const activationData = buildBillingActivationData(summary.durationMonths)
      await prisma.brandSubscription.update({
        where: { id: pendingSub.id },
        data: activationData,
      })
      const createdBrand = pendingBrandName
        ? await createBrandForActivatedSubscription({
            subscriptionId: pendingSub.id,
            ownerId: session.user.id,
            name: pendingBrandName,
            description: pendingBrandDescription || null,
            location: pendingBrandLocation || null,
            ownerEmail: pendingBrandOwnerEmail || null,
            timezone: pendingBrandTimezone,
            address: pendingBrandAddress || null,
          })
        : null
      if (pendingBrandName && !createdBrand?.ok) {
        return NextResponse.json(
          { error: '订阅已激活，但品牌创建失败', reason: createdBrand?.reason || 'unknown' },
          { status: 500 }
        )
      }
      const activatedSubscription = await prisma.brandSubscription.findUnique({
        where: { id: pendingSub.id },
      })
      const keyResult = pendingBrandName
        ? { agentId: createdBrand?.ok ? createdBrand.agentId || null : null }
        : await ensureBrandAgentKeyAfterSubscription({
            ownerId: session.user.id,
          })
      if (brandId && keyResult.agentId) {
        await prisma.brandAgent.upsert({
          where: { brandId_agentId: { brandId, agentId: keyResult.agentId } },
          create: { brandId, agentId: keyResult.agentId, role: 'worker', active: true },
          update: { role: 'worker', active: true },
        })
      }

      // Send Subscription Success Confirmation Email (No username/password)
      try {
        const userObj = await prisma.human.findUnique({
          where: { id: session.user.id },
          select: { email: true, nickname: true }
        })
        if (userObj?.email) {
          const targetBrandName = pendingBrandName || (brandId ? (await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } }))?.name : null) || '您的品牌'
          await sendSubscriptionSuccessEmail({
            to: userObj.email,
            nickname: userObj.nickname || userObj.email.split('@')[0],
            brandName: targetBrandName,
            planName: pendingSub.planName,
          })
        }
      } catch (emailErr) {
        console.error('[billing_subscription_email] failed to send success email:', emailErr)
      }
      return NextResponse.json({
        success: true,
        ...buildBillingActivatedResponse({
          subscriptionId: pendingSub.id,
          totalDueUsd: summary.totalDueUsd,
          agentId: keyResult.agentId,
        }),
        subscription: activatedSubscription,
        brand: createdBrand?.ok ? createdBrand.brand : null,
      })
    }

    if (paymentMode === 'OFFLINE') {
      return NextResponse.json(
        buildOfflineInvoiceResponse({
          subscriptionId: pendingSub.id,
          status: pendingSub.status,
          totalDueUsd: summary.totalDueUsd,
        })
      )
    }

    if (!stripe) {
      return NextResponse.json({ error: 'Stripe is not configured on main server' }, { status: 503 })
    }

    const origin = request.headers.get('x-forwarded-host')
      ? `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('x-forwarded-host')}`
      : new URL(request.url).origin
    
    // Check if called from mobile companion client
    const isMm = body.clientType === 'mm' || request.headers.get('x-client-type') === 'mm'
    const successRedirectUrl = isMm ? 'https://amc-mm.immedi.ai/dashboard' : `${origin}/dashboard`

    const pendingBrandParams = new URLSearchParams()
    if (pendingBrandName) pendingBrandParams.set('newBrandName', pendingBrandName)
    if (pendingBrandLocation) pendingBrandParams.set('newBrandLocation', pendingBrandLocation)
    if (pendingBrandAddress) pendingBrandParams.set('newBrandAddress', pendingBrandAddress)
    if (pendingBrandOwnerEmail) pendingBrandParams.set('newBrandOwnerEmail', pendingBrandOwnerEmail)

    const pendingBrandQuery = pendingBrandParams.toString() ? `&${pendingBrandParams.toString()}` : ''
    const successUrl = `${successRedirectUrl}?success=1&sid={CHECKOUT_SESSION_ID}&sub=${pendingSub.id}${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}${pendingBrandQuery}`
    const cancelUrl = `${successRedirectUrl}?canceled=1&sub=${pendingSub.id}${brandId ? `&brandId=${encodeURIComponent(brandId)}` : ''}${pendingBrandQuery}`

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        quantity: 1,
        price_data: {
          currency: 'usd',
          unit_amount: summary.totalDueUsd * 100,
          product_data: {
            name: `AMC ${selectedPlan.name} x ${summary.durationMonths} months`,
            description: `Billed months: ${summary.billedMonths}. Includes selected addons.`,
          },
        },
      },
    ]

    const sessionCheckout = await stripe.checkout.sessions.create({
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: lineItems,
      metadata: {
        subscriptionId: pendingSub.id,
        planId,
        paymentMode,
        durationMonths: String(summary.durationMonths),
        discountPercent: String(summary.discountPercent),
        pendingBrandName,
        pendingBrandLocation,
        pendingBrandDescription,
        pendingBrandOwnerEmail,
        pendingBrandTimezone,
        pendingBrandAddress,
        multiStoreQty: String(addonQuantities['multi_store'] ?? 0),
      },
    })

    await prisma.brandSubscription.update({
      where: { id: pendingSub.id },
      data: {
        paymentSessionId: sessionCheckout.id,
        paymentUrl: sessionCheckout.url,
      },
    })

    return NextResponse.json({
      success: true,
      subscriptionId: pendingSub.id,
      checkoutSessionId: sessionCheckout.id,
      checkoutUrl: sessionCheckout.url,
    })

  } catch (err: any) {
    console.error('[MM-API-Sub-Create] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
