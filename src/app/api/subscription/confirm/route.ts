import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { activateSubscriptionByPaymentSession, createBrandForActivatedSubscription, ensureBrandAgentKeyAfterSubscription } from '@/lib/subscription/service'
import Stripe from 'stripe'
import { sendSubscriptionSuccessEmail } from '@/lib/email'

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!stripe) {
    return NextResponse.json({ error: 'Online payment is not configured. Missing STRIPE_SECRET_KEY.' }, { status: 503 })
  }

  const body = await request.json()
  const checkoutSessionId = String(body.checkoutSessionId ?? '')
  const subscriptionId = String(body.subscriptionId ?? '')

  if (!checkoutSessionId || !subscriptionId) {
    return NextResponse.json({ error: 'checkoutSessionId and subscriptionId are required' }, { status: 400 })
  }

  const sub = await prisma.brandSubscription.findFirst({
    where: { id: subscriptionId, createdById: session.user.id },
  })
  if (!sub) return NextResponse.json({ error: 'Subscription order not found' }, { status: 404 })

  const checkout = await stripe.checkout.sessions.retrieve(checkoutSessionId)

  if (checkout.id !== sub.paymentSessionId) {
    return NextResponse.json({ error: 'Checkout session does not match the subscription order' }, { status: 400 })
  }

  if (checkout.payment_status !== 'paid') {
    return NextResponse.json({ error: `Payment status is ${checkout.payment_status}` }, { status: 400 })
  }

  const activated = await activateSubscriptionByPaymentSession(checkoutSessionId)
  if (!activated.ok) {
    return NextResponse.json({ error: 'Subscription order not found by payment session' }, { status: 404 })
  }

  const pendingBrandName = typeof checkout.metadata?.pendingBrandName === 'string'
    ? checkout.metadata.pendingBrandName.trim()
    : ''
  const pendingBrandLocation = typeof checkout.metadata?.pendingBrandLocation === 'string'
    ? checkout.metadata.pendingBrandLocation.trim()
    : ''
  const pendingBrandDescription = typeof checkout.metadata?.pendingBrandDescription === 'string'
    ? checkout.metadata.pendingBrandDescription.trim()
    : ''
  const pendingBrandAddress = typeof checkout.metadata?.pendingBrandAddress === 'string'
    ? checkout.metadata.pendingBrandAddress.trim()
    : ''
  const pendingBrandOwnerEmail = typeof checkout.metadata?.pendingBrandOwnerEmail === 'string'
    ? checkout.metadata.pendingBrandOwnerEmail.trim().toLowerCase()
    : ''
  const pendingBrandTimezone = typeof checkout.metadata?.pendingBrandTimezone === 'string'
    ? checkout.metadata.pendingBrandTimezone.trim()
    : ''

  const createdBrand = pendingBrandName
    ? await createBrandForActivatedSubscription({
        subscriptionId,
        ownerId: session.user.id,
        name: pendingBrandName,
        description: pendingBrandDescription || null,
        location: pendingBrandLocation || null,
        ownerEmail: pendingBrandOwnerEmail || null,
        timezone: pendingBrandTimezone || null,
        address: pendingBrandAddress || null,
      })
    : null
  if (pendingBrandName && !createdBrand?.ok) {
    return NextResponse.json(
      { error: '支付已确认，但品牌创建失败，请联系管理员处理。', reason: createdBrand?.reason || 'unknown' },
      { status: 500 }
    )
  }

  const keyResult = activated.alreadyActive
    ? null
    : pendingBrandName
      ? null
      : await ensureBrandAgentKeyAfterSubscription({
        ownerId: session.user.id,
      })

  if (sub.brandId && keyResult?.agentId) {
    await prisma.brandAgent.upsert({
      where: { brandId_agentId: { brandId: sub.brandId, agentId: keyResult.agentId } },
      create: { brandId: sub.brandId, agentId: keyResult.agentId, role: 'worker', active: true },
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
      let targetBrandName = pendingBrandName
      if (!targetBrandName && sub.brandId) {
        const bObj = await prisma.brand.findUnique({ where: { id: sub.brandId }, select: { name: true } })
        targetBrandName = bObj?.name || ''
      }
      await sendSubscriptionSuccessEmail({
        to: userObj.email,
        nickname: userObj.nickname || userObj.email.split('@')[0],
        brandName: targetBrandName || '您的品牌',
        planName: sub.planName,
      })
    }
  } catch (emailErr) {
    console.error('[confirm_subscription_email] failed to send success email:', emailErr)
  }

  return NextResponse.json({
    ok: true,
    subscription: activated.subscription,
    alreadyActive: activated.alreadyActive,
    agentKeyGenerated: Boolean(keyResult),
    agentId: keyResult?.agentId || null,
    brand: createdBrand?.ok ? createdBrand.brand : null,
  })
}
