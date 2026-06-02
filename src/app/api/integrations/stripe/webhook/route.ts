import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { activateSubscriptionByPaymentSession, ensureBrandAgentKeyAfterSubscription } from '@/lib/subscription/service'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const stripeKey = process.env.STRIPE_SECRET_KEY
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
const stripe = stripeKey ? new Stripe(stripeKey) : null

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return 'Unknown error'
}

export async function POST(request: Request) {
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }

  const signature = request.headers.get('stripe-signature')
  if (!signature) return NextResponse.json({ error: 'Missing stripe-signature' }, { status: 400 })

  const payload = await request.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(payload, signature, webhookSecret)
  } catch (e: unknown) {
    return NextResponse.json({ error: `Invalid signature: ${getErrorMessage(e)}` }, { status: 400 })
  }

  try {
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.id) {
        const activated = await activateSubscriptionByPaymentSession(session.id)
        if (activated.ok && !activated.alreadyActive && activated.subscription.createdById) {
          await ensureBrandAgentKeyAfterSubscription({
            brandId: activated.subscription.brandId || null,
            ownerId: activated.subscription.createdById,
          })
        }
      }
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.id) {
        await prisma.brandSubscription.updateMany({
          where: { paymentSessionId: session.id, status: 'PENDING' },
          data: { status: 'FAILED' },
        })
      }
    }
  } catch (e: unknown) {
    return NextResponse.json({ error: `Webhook handler error: ${getErrorMessage(e)}` }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}
