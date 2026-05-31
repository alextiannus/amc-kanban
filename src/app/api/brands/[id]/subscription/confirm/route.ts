import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canOwnBrand } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { activateSubscriptionByPaymentSession, ensureBrandAgentKeyAfterSubscription } from '@/lib/subscription/service'
import Stripe from 'stripe'

type Params = { params: Promise<{ id: string }> }

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canOwnBrand(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
    where: { id: subscriptionId, brandId },
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

  const keyResult = activated.alreadyActive
    ? null
    : await ensureBrandAgentKeyAfterSubscription({
        brandId,
        ownerId: session.user.id,
      })

  return NextResponse.json({
    ok: true,
    subscription: activated.subscription,
    alreadyActive: activated.alreadyActive,
    agentKeyGenerated: Boolean(keyResult),
    agentId: keyResult?.agentId || null,
  })
}
