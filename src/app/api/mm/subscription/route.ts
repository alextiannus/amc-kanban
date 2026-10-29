import { after, NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import Stripe from 'stripe'
import { SUBSCRIPTION_PLANS, SUBSCRIPTION_ADDONS, DEFAULT_SUBSCRIPTION_TERMS_VERSION, calculatePricing, normalizeAddonQuantity } from '@/lib/subscription/catalog'
import { buildOfflineInvoiceResponse, buildBillingActivatedResponse, buildBillingActivationData } from '@/lib/subscription/workflow'
import { createBrandForActivatedSubscription } from '@/lib/subscription/service'
import { queueSubscriptionQuotation, dispatchSubscriptionQuotation } from '@/lib/subscription/quotationService'
import { authenticateRequest, canAccessBrand } from '@/lib/auth-v2'

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

export async function POST(request: NextRequest) {
  const t0 = Date.now()
  console.log('[MM-Sub] POST received — calling getSession()')

  const session = await getSession()
  console.log(`[MM-Sub] getSession() done (${Date.now() - t0}ms)`, session ? `user=${session.user.id}` : 'NO SESSION')

  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    for (const [field, maxLength] of [['quotationCompanyName', 200], ['quotationUen', 32]] as const) {
      const value = body[field]
      if (value !== undefined && (typeof value !== 'string' || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value))) {
        return NextResponse.json({ error: `Invalid ${field}` }, { status: 400 })
      }
    }
    const quotationCompanyName = String(body.quotationCompanyName || '').trim()
    const quotationUen = String(body.quotationUen || '').trim()
    const url = new URL(request.url)
    const queryBrandId = url.searchParams.get('brandId')
    const rawBrandId = String(body.brandId ?? queryBrandId ?? '').trim()
    let brandId = rawBrandId || null

    let pendingBrandName = String(body.pendingBrandName ?? '').trim()
    const pendingBrandLocation = String(body.pendingBrandLocation ?? '').trim()
    const pendingBrandAddress = String(body.pendingBrandAddress ?? '').trim()
    const pendingBrandOwnerEmail = String(body.pendingBrandOwnerEmail ?? '').trim().toLowerCase()
    const pendingBrandTimezone = String(body.timezone ?? '').trim() || 'Asia/Singapore'
    const pendingBrandDescription = String(body.pendingBrandDescription ?? '').trim()

    // Distinguish MM app requests from kanban-originated requests.
    // The MM proxy always sets x-client-type: mm (see amc-mm/src/app/api/subscription/route.ts).
    // Kanban-originated requests (admin panel, brand owner dashboard) have no such header.
    const isMmRequest = body.clientType === 'mm' || request.headers.get('x-client-type') === 'mm'

    const quotationUser = isMmRequest ? await prisma.user.findUnique({
      where: { id: session.user.id }, select: { email: true, nickname: true },
    }) : null
    if (isMmRequest && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(quotationUser?.email || '')) {
      return NextResponse.json({ error: '请先为账号绑定有效邮箱，以接收订阅报价' }, { status: 400 })
    }
    async function quotationFor(subscriptionId: string, brandName: string, address?: string, originalTotal?: number) {
      if (!isMmRequest) return undefined
      const receipt = await queueSubscriptionQuotation({
        subscriptionId, userId: session!.user.id, recipient: quotationUser!.email,
        customer: brandName || quotationUser!.nickname || quotationUser!.email,
        brandName, address, originalTotal, companyName: quotationCompanyName, uen: quotationUen,
      })
      after(async () => {
        try { await dispatchSubscriptionQuotation(subscriptionId) }
        catch { console.error('[quotation] Dispatch interrupted; durable worker will recover') }
      })
      return { number: receipt.number, status: receipt.state, message: receipt.state === 'UNKNOWN' ? '报价发送状态待核对，请勿重复提交' : receipt.state === 'SENT' ? '报价已提交邮件服务' : '报价已保存，将发送至您的账号邮箱' }
    }

    console.log('[MM-Sub] POST start', {
      userId: session.user.id,
      brandId,
      pendingBrandName: pendingBrandName || undefined,
      planId: body.planId,
      durationMonths: body.durationMonths,
      paymentMode: body.paymentMode ?? body.paymentMethod,
    })

    if (brandId && pendingBrandName) {
      return NextResponse.json({ error: 'brandId and pendingBrandName cannot be used together' }, { status: 400 })
    }

    // ownerEmail: if not provided by caller, auto-populate from session (MM side: brand owner = logged-in user)
    const resolvedOwnerEmail = pendingBrandOwnerEmail
      || (pendingBrandName ? (session.user.email ?? '') : '')

    // Validate ownerEmail when creating a new brand
    if (pendingBrandName && !resolvedOwnerEmail) {
      return NextResponse.json({ error: '新建品牌必须提供品牌主邮件，且登录账号需绑定邮件地址' }, { status: 400 })
    }
    if (pendingBrandName && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(resolvedOwnerEmail)) {
      return NextResponse.json({ error: '品牌主邮件格式无效' }, { status: 400 })
    }

    const planId = String(body.planId ?? 'essential')
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

    let summary: ReturnType<typeof calculatePricing>
    try { summary = calculatePricing(planId, durationMonths, uniqueAddonIds, addonQuantities) }
    catch { return NextResponse.json({ error: 'Invalid subscription pricing or duration' }, { status: 400 }) }
    const selectedAddons = SUBSCRIPTION_ADDONS.filter((a: any) => uniqueAddonIds.includes(a.id)).map((addon: any) => ({
      ...addon,
      quantity: normalizeAddonQuantity(addon.id, addonQuantities[addon.id] ?? 1),
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
            where: { inviteCode: promoCode },
            include: { businessRoles: true }
          })
          if (userReferrer && userReferrer.id !== session.user.id && userReferrer.businessRoles.some((role: { role: string }) => role.role === 'BD')) {
            finalReferredById = userReferrer.id
            promoCodeType = 'USER_INVITE'
            promoDiscountAmount = 200 * durationMonths
          }
        }
    }

    const finalTotalDue = Math.max(0, Math.round(summary.totalDueUsd - promoDiscountAmount))

    if (pendingBrandName) {
      const { findOrCreateBrandOwnerAccount } = await import('@/lib/brandOwnerAccount')
      const brandOwner = await findOrCreateBrandOwnerAccount(resolvedOwnerEmail)
      if (brandOwner.ok) {
        const brandOwnerId = brandOwner.user.id
        const existingBrand = await prisma.brand.findFirst({
          where: {
            ownerId: brandOwnerId,
            name: pendingBrandName,
            status: 'ACTIVE',
          },
          include: {
            subscriptions: {
              where: { status: 'PENDING' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
        })

        if (existingBrand) {
          console.log(`[MM-Sub] Found existing active brand: ${existingBrand.id} for owner: ${brandOwnerId}`)
          const principal = await authenticateRequest(request)
          if (!principal || !await canAccessBrand(principal, existingBrand.id, 'subscription.manage')) {
            return NextResponse.json({ error: '无此品牌的订阅管理权限' }, { status: 403 })
          }
          const candidate = existingBrand.subscriptions[0]
          const addonKey = (items: unknown) => JSON.stringify((Array.isArray(items) ? items : []).map((item: any) => [item.id, item.quantity ?? 1, item.usd, item.pricing]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
          const existingPendingSub = candidate && candidate.createdById === session.user.id
            && candidate.planId === selectedPlan.id && candidate.durationMonths === summary.durationMonths
            && candidate.totalDueUsd === finalTotalDue && candidate.currency === 'SGD'
            && addonKey(candidate.selectedAddons) === addonKey(selectedAddons) ? candidate : null
          if (existingPendingSub) {
            console.log(`[MM-Sub] Reusing existing pending subscription: ${existingPendingSub.id}`)
            const rawRequestedMode = body.paymentMode ?? body.paymentMethod
            const isBillingRequest = rawRequestedMode === 'BILLING' || rawRequestedMode === 'invoice'
            if (isMmRequest && isBillingRequest) {
              const activationData = buildBillingActivationData(existingPendingSub.durationMonths)
              const activatedSub = await prisma.brandSubscription.update({
                where: { id: existingPendingSub.id },
                data: activationData,
              })
              const quotation = await quotationFor(activatedSub.id, existingBrand.name, undefined, summary.totalDueUsd)
              return NextResponse.json({
                quotation,
                success: true,
                status: 'ACTIVE',
                message: '品牌已创建并激活，7天试用已开始',
                subscriptionId: activatedSub.id,
                subscription: activatedSub,
                brand: existingBrand,
              })
            }
            const quotation = await quotationFor(existingPendingSub.id, existingBrand.name, undefined, summary.totalDueUsd)
            return NextResponse.json({
              quotation,
              success: true,
              status: 'PENDING',
              message: '订阅申请已提交，等待付款确认后由 Admin 激活',
              subscriptionId: existingPendingSub.id,
              subscription: existingPendingSub,
              brand: existingBrand,
            })
          } else {
            console.log(`[MM-Sub] Brand exists but has no pending subscription. Mapping request to existing brand: ${existingBrand.id}`)
            brandId = existingBrand.id
            pendingBrandName = ''
          }
        }
      }
    }

    if (brandId) {
      const exists = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true } })
      if (!exists) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
      const principal = await authenticateRequest(request)
      if (!principal || !await canAccessBrand(principal, brandId, 'subscription.manage')) {
        return NextResponse.json({ error: '无此品牌的订阅管理权限' }, { status: 403 })
      }
    }

    if (paymentMode === 'ONLINE' && !stripe) {
      return NextResponse.json({ error: 'Stripe is not configured on main server' }, { status: 503 })
    }
    const existingQuotationBrand = brandId ? await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } }) : null
    const quotationBrandName = pendingBrandName || existingQuotationBrand?.name || ''

    console.log(`[MM-Sub] creating BrandSubscription (${Date.now() - t0}ms since start)`)
    const pendingSub = await prisma.brandSubscription.create({
      data: {
          currency: 'SGD',
        brandId,
        planId: selectedPlan.id,
        planName: selectedPlan.name,
        durationMonths: summary.durationMonths,
        billedMonths: summary.billedMonths,
        monthlyBaseUsd: Math.round(summary.monthlyBaseUsd),
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
    console.log(`[MM-Sub] BrandSubscription created: ${pendingSub.id}, status=${pendingSub.status} (${Date.now() - t0}ms)`)

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
      // Kanban-originated requests (admin, brand owner on kanban) → activate immediately.
      // MM new-brand requests also activate immediately so merchants can use their 7-day trial.
      const shouldActivate = !isMmRequest || Boolean(pendingBrandName)

      if (shouldActivate) {
        const activationData = buildBillingActivationData(summary.durationMonths)
        await prisma.brandSubscription.update({
          where: { id: pendingSub.id },
          data: activationData,
        })
        console.log(`[MM-Sub] subscription ACTIVATED (${Date.now() - t0}ms)`)

        const createdBrand = pendingBrandName
          ? await (async () => {
              console.log(`[MM-Sub] calling createBrandForActivatedSubscription (ADMIN, ${Date.now() - t0}ms)`)
              const result = await createBrandForActivatedSubscription({
                subscriptionId: pendingSub.id,
                notificationMode: isMmRequest ? 'quotation' : 'service_terms',
                ownerId: session.user.id,
                name: pendingBrandName,
                description: pendingBrandDescription || null,
                location: pendingBrandLocation || null,
                ownerEmail: resolvedOwnerEmail,
                timezone: pendingBrandTimezone,
                address: pendingBrandAddress || null,
              })
              console.log(`[MM-Sub] brand created (ADMIN, ${Date.now() - t0}ms):`, result.ok)
              return result
            })()
          : null

        if (pendingBrandName && !createdBrand?.ok) {
          return NextResponse.json(
            { error: '订阅已激活，但品牌创建失败', reason: createdBrand?.reason || 'unknown' },
            { status: 500 }
          )
        }

        const activatedSubscription = await prisma.brandSubscription.findUnique({ where: { id: pendingSub.id } })
        console.log(`[MM-Sub] BILLING ADMIN success (${Date.now() - t0}ms)`)
        const quotation = await quotationFor(pendingSub.id, quotationBrandName, pendingBrandAddress, summary.totalDueUsd)
        return NextResponse.json({
          quotation,
          success: true,
          ...buildBillingActivatedResponse({
            subscriptionId: pendingSub.id,
            totalDueUsd: finalTotalDue,
            agentId: createdBrand?.ok ? (createdBrand as any).agentId || null : null,
          }),
          subscription: activatedSubscription,
          brand: createdBrand?.ok ? createdBrand.brand : null,
        })
      }

      // Existing-brand MM billing requests still stay PENDING until Admin confirms payment.
      console.log(`[MM-Sub] BILLING path — MM user, subscription stays PENDING (${Date.now() - t0}ms)`)

      const createdBrand = pendingBrandName
        ? await (async () => {
            console.log(`[MM-Sub] calling createBrandForActivatedSubscription for PENDING sub (${Date.now() - t0}ms)`)
            const result = await createBrandForActivatedSubscription({
              subscriptionId: pendingSub.id,
              notificationMode: isMmRequest ? 'quotation' : 'service_terms',
              ownerId: session.user.id,
              name: pendingBrandName,
              description: pendingBrandDescription || null,
              location: pendingBrandLocation || null,
              ownerEmail: resolvedOwnerEmail,
              timezone: pendingBrandTimezone,
              address: pendingBrandAddress || null,
            })
            console.log(`[MM-Sub] brand created (${Date.now() - t0}ms):`, result.ok, 'reason' in result ? result.reason : `brand=${result.brand?.id}`)
            return result
          })()
        : null

      if (pendingBrandName && !createdBrand?.ok) {
        console.error(`[MM-Sub] brand creation failed (${Date.now() - t0}ms):`, (createdBrand as any)?.reason)
        return NextResponse.json(
          { error: '订阅已提交，但品牌初始化失败', reason: createdBrand?.reason || 'unknown' },
          { status: 500 }
        )
      }

      console.log(`[MM-Sub] BILLING pending — responding (${Date.now() - t0}ms)`)
      const quotation = await quotationFor(pendingSub.id, quotationBrandName, pendingBrandAddress, summary.totalDueUsd)
      return NextResponse.json({
        quotation,
        success: true,
        status: 'PENDING',
        message: '订阅申请已提交，等待付款确认后由 Admin 激活',
        subscriptionId: pendingSub.id,
        subscription: pendingSub,
        brand: createdBrand?.ok ? createdBrand.brand : null,
      })
    }

    if (paymentMode === 'OFFLINE') {
      console.log(`[MM-Sub] OFFLINE path — responding invoice (${Date.now() - t0}ms)`)
      const quotation = await quotationFor(pendingSub.id, quotationBrandName, pendingBrandAddress, summary.totalDueUsd)
      return NextResponse.json({
        quotation,
        ...buildOfflineInvoiceResponse({
          subscriptionId: pendingSub.id,
          status: pendingSub.status,
          totalDueUsd: finalTotalDue,
        }),
      })
    }

    if (!stripe) {
      console.error('[MM-Sub] Stripe not configured')
      return NextResponse.json({ error: 'Stripe is not configured on main server' }, { status: 503 })
    }

    console.log(`[MM-Sub] ONLINE path — creating Stripe checkout session (${Date.now() - t0}ms)`)  

    const origin = request.headers.get('x-forwarded-host')
      ? `${request.headers.get('x-forwarded-proto') || 'http'}://${request.headers.get('x-forwarded-host')}`
      : new URL(request.url).origin
    
    // Check if called from mobile companion client (isMmRequest defined at top of handler)
    const successRedirectUrl = isMmRequest ? 'https://amc-mm.immedi.ai/dashboard' : `${origin}/dashboard`

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
          currency: 'sgd',
          unit_amount: finalTotalDue * 100,
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
        clientType: isMmRequest ? 'mm' : 'kanban',
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

    console.log(`[MM-Sub] Stripe checkout session created: ${sessionCheckout.id} (${Date.now() - t0}ms)`)

    await prisma.brandSubscription.update({
      where: { id: pendingSub.id },
      data: {
        paymentSessionId: sessionCheckout.id,
        paymentUrl: sessionCheckout.url,
      },
    })

    console.log(`[MM-Sub] ONLINE success, responding with checkoutUrl (${Date.now() - t0}ms)`)
    const quotation = await quotationFor(pendingSub.id, quotationBrandName, pendingBrandAddress, summary.totalDueUsd)
    return NextResponse.json({
      quotation,
      success: true,
      subscriptionId: pendingSub.id,
      checkoutSessionId: sessionCheckout.id,
      checkoutUrl: sessionCheckout.url,
    })

  } catch (err: any) {
    console.error('[MM-Sub] POST failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
