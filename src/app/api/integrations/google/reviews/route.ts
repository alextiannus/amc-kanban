import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchGoogleReviews } from '@/lib/integrations/google'
import { sendLarkWebhookNotification } from '@/lib/integrations/lark'
import { eventEmitter } from '@/lib/events'

/**
 * GET /api/integrations/google/reviews?brandId=<id>
 * Fetches latest Google Business reviews, creates urgent ActionItems for bad ones.
 */
export async function GET(request: Request) {
  const session = await getSession()
  const authHeader = request.headers.get('authorization') ?? ''
  const agentKey = authHeader.replace('Bearer ', '').trim()
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  if (!session?.user && !agentKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!session?.user && agentKey) {
    const agent = await prisma.user.findFirst({ where: { apiKey: agentKey, type: 'AI_AGENT' } })
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true, name: true,
      googlePlaceId: true, googleApiKey: true,
      larkBotWebhook: true,
    },
  })

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  if (!brand.googlePlaceId || !brand.googleApiKey) {
    return NextResponse.json({ error: 'Google Business not configured' }, { status: 422 })
  }

  const { reviews, error } = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
  if (error) return NextResponse.json({ error }, { status: 502 })

  // Auto-create ActionItems for bad reviews (≤ 3 stars) not yet in the system
  const newAlerts: string[] = []
  for (const review of reviews.filter(r => r.rating <= 3)) {
    const existing = await prisma.actionItem.findFirst({
      where: {
        brandId,
        type: 'sentiment_alert',
        payload: { path: ['reviewId'], equals: review.reviewId },
      },
    })
    if (existing) continue

    const item = await prisma.actionItem.create({
      data: {
        brandId,
        type: 'sentiment_alert',
        priority: review.rating <= 2 ? 'urgent' : 'high',
        title: `收到 Google【${review.rating}★ 差评】需立即回复`,
        description: `"${review.comment.slice(0, 120)}..." — ${review.reviewer}`,
        payload: {
          reviewId: review.reviewId,
          reviewer: review.reviewer,
          rating: review.rating,
          reviewText: review.comment,
          createTime: review.createTime,
          // AI-generated suggested replies would be added by the Agent
          suggestedReplies: [],
        },
        status: 'pending',
      },
    })
    newAlerts.push(item.id)

    // Send Lark notification if webhook configured
    if (brand.larkBotWebhook) {
      sendLarkWebhookNotification({
        webhookUrl: brand.larkBotWebhook,
        title: `⚠️ Google 差评预警 — ${brand.name}`,
        content: `**${review.reviewer}** 给出了 **${review.rating}★** 的评价：\n\n"${review.comment.slice(0, 200)}"`,
        actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard`,
        urgent: review.rating <= 2,
      }).catch(console.error)
    }
  }

  if (newAlerts.length > 0) eventEmitter.emit('board_update')

  return NextResponse.json({ reviews, newAlertsCreated: newAlerts.length })
}
