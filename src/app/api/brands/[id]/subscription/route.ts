import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canHumanAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { ALLOWED_DURATIONS, SUBSCRIPTION_ADDONS, SUBSCRIPTION_PLANS, calculatePricing } from '@/lib/subscription/catalog'
import Stripe from 'stripe'

type Params = { params: Promise<{ id: string }> }

const stripeKey = process.env.STRIPE_SECRET_KEY
const stripe = stripeKey ? new Stripe(stripeKey) : null

export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const [brand, latest] = await Promise.all([
    prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } }),
    prisma.brandSubscription.findFirst({
      where: { brandId },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  return NextResponse.json({
    brand,
    plans: SUBSCRIPTION_PLANS,
    addons: SUBSCRIPTION_ADDONS,
    durations: ALLOWED_DURATIONS,
    latestSubscription: latest,
    paymentEnabled: Boolean(stripe),
  })
}

export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId } = await params
  if (session.user.type === 'AI_AGENT') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!(await canHumanAccessBrandProject(brandId, session.user.id, session.user.role))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (!stripe) {
    return NextResponse.json({ error: 'Online payment is not configured. Missing STRIPE_SECRET_KEY.' }, { status: 503 })
  }

  const brand = await prisma.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true } })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const body = await request.json()
  const planId = String(body.planId ?? '')
  const durationMonths = Number(body.durationMonths)
  const addonIds = Array.isArray(body.addonIds) ? body.addonIds.map((v: unknown) => String(v)) : []

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === planId)
  if (!selectedPlan) return NextResponse.json({ error: 'Invalid planId' }, { status: 400 })

  const summary = calculatePricing(planId, durationMonths, addonIds)
  const selectedAddons = SUBSCRIPTION_ADDONS.filter((a) => addonIds.includes(a.id))

  const pending = await prisma.brandSubscription.create({
    data: {
      brandId,
      planId: selectedPlan.id,
      planName: selectedPlan.name,
      durationMonths: summary.durationMonths,
      billedMonths: summary.billedMonths,
      monthlyBaseUsd: summary.monthlyBaseUsd,
      recurringAddonsUsd: summary.recurringAddonsUsd,
      oneTimeAddonsUsd: summary.oneTimeAddonsUsd,
      totalDueUsd: summary.totalDueUsd,
      status: 'PENDING',
      paymentProvider: 'STRIPE',
      selectedAddons: selectedAddons,
      createdById: session.user.id,
    },
  })

  const origin = new URL(request.url).origin
  const successUrl = `${origin}/board/subscription/${brandId}?success=1&sid={CHECKOUT_SESSION_ID}&sub=${pending.id}`
  const cancelUrl = `${origin}/board/subscription/${brandId}?canceled=1&sub=${pending.id}`

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    {
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: summary.totalDueUsd * 100,
        product_data: {
          name: `AMC ${selectedPlan.name} x ${summary.durationMonths} months`,
          description: `Billed months: ${summary.billedMonths}. Includes selected add-ons and one-time services.`,
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
      brandId,
      subscriptionId: pending.id,
      planId,
      durationMonths: String(summary.durationMonths),
      billedMonths: String(summary.billedMonths),
    },
  })

  await prisma.brandSubscription.update({
    where: { id: pending.id },
    data: {
      paymentSessionId: sessionCheckout.id,
      paymentUrl: sessionCheckout.url,
    },
  })

  return NextResponse.json({
    subscriptionId: pending.id,
    checkoutSessionId: sessionCheckout.id,
    checkoutUrl: sessionCheckout.url,
  })
}
