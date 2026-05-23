import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendLarkWebhookNotification } from '@/lib/integrations/lark'
import { eventEmitter } from '@/lib/events'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import {
  fetchGoogleGBPReviews,
  fetchGoogleReviews,
  getGoogleAccessToken,
  replyGoogleGBPReview,
} from '@/lib/integrations/google'

// Gemini reply generator helper
async function generateReviewReply(
  comment: string,
  rating: number,
  reviewer: string,
  brandName: string,
  compensationLink?: string
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    if (rating >= 4) {
      return `非常感谢 ${reviewer} 对我们【${brandName}】的支持和五星好评！我们会继续努力提供更美味的菜品和优质的服务，期待您的再次光临！`
    } else {
      const linkText = compensationLink ? ` 请点击链接领取我们的诚意补偿：${compensationLink}` : ''
      return `您好 ${reviewer}，非常抱歉这次消费没能让您满意。我们非常重视您的反馈，已经安排门店进行整改。${linkText} 期待能为您提供更好的体验。`
    }
  }

  try {
    const prompt = `你是一家名为“${brandName}”的本地生活商户的 AI 客服经理。
请针对以下客户给出的评价写一段客气、礼貌且得体的回复：
客户名称：${reviewer}
评分星级：${rating} 星 (共5星)
客户评论内容："${comment || '（未写评论，仅给出了星级）'}"
${
  rating >= 4
    ? `这是一条好评。请用热情的语气感谢顾客，并针对评论中提到的具体菜品或细节进行回应，邀请他们再次光临。`
    : `这是一条差评或中评。请以诚恳、抱歉的语气致歉，说明我们非常重视，并表示已经反馈给后厨/服务团队整改。`
}
${
  compensationLink
    ? `并且，请在回复的结尾，礼貌地引导顾客点击此私密补偿链接领取我们的致歉心意（如免费卡券等）：${compensationLink}`
    : ''
}
请直接输出回复文本，不要包含任何 markdown 标记、HTML 代码或外部包裹符号，字数控制在 150 字以内。`

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 200 },
        }),
      }
    )

    if (!response.ok) throw new Error('Gemini API failed')
    const json = await response.json()
    const text = json.candidates?.[0]?.content?.parts?.[0]?.text
    return text ? text.trim() : '非常感谢您的反馈！'
  } catch (e) {
    console.error('[Gemini Reply Generator Error]', e)
    if (rating >= 4) {
      return `非常感谢对我们【${brandName}】的五星好评！我们会继续保持，期待您的再次光临！`
    } else {
      return `非常抱歉这次就餐体验不佳，我们已经将意见反馈给店长整改，期待能为您提供更好的服务。`
    }
  }
}

/**
 * Helper to authenticate caller (session or api key) and check brand access.
 */
async function authenticateAndAuthorize(request: Request, brandId: string) {
  const session = await getSession()
  let userId: string
  let userType: string
  let userRole: string | undefined

  if (session?.user) {
    userId = session.user.id
    userType = session.user.type
    userRole = session.user.role
  } else {
    const apiKey = extractApiKey(request)
    if (!apiKey) {
      return { authorized: false, errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    const agent = await getAgentFromApiKey(apiKey)
    if (!agent) {
      return { authorized: false, errorResponse: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    }
    userId = agent.id
    userType = agent.type
    userRole = 'USER'
  }

  const hasAccess = await canSessionAccessBrandProject(brandId, userId, userType, userRole)
  if (!hasAccess) {
    return { authorized: false, errorResponse: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { authorized: true, userId, userType, userRole }
}

/**
 * Helper to dynamically fetch and persist real Google account ID to database
 * to avoid failure when primary alias path is used.
 */
async function resolveAndSaveRealAccountId(brandId: string, accessToken: string, currentAccountId?: string | null): Promise<string> {
  if (currentAccountId && currentAccountId !== 'primary' && currentAccountId !== 'accounts/primary' && !currentAccountId.startsWith('mock_')) {
    return currentAccountId
  }
  if (accessToken.startsWith('mock_')) {
    return 'mock_account_123'
  }
  try {
    const accRes = await fetch('https://mybusiness.googleapis.com/v1/accounts', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    })
    if (accRes.ok) {
      const accData = await accRes.json()
      const accounts = accData.accounts ?? []
      if (accounts.length > 0) {
        const realAccountId = accounts[0].name // e.g. "accounts/123456"
        await prisma.brand.update({
          where: { id: brandId },
          data: { googleAccountId: realAccountId }
        })
        console.log(`[Google OAuth] Resolved and persisted real account ID for brand ${brandId}: ${realAccountId}`)
        return realAccountId
      }
    }
  } catch (e) {
    console.error(`[Google OAuth] Failed to dynamically resolve real account ID for brand ${brandId}`, e)
  }
  return currentAccountId || 'primary'
}

/**
 * GET /api/integrations/google/reviews?brandId=<id>
 * READ-ONLY: Fetches latest Google Business reviews.
 * Side-effect free, idempotent.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const auth = await authenticateAndAuthorize(request, brandId)
  if (!auth.authorized) return auth.errorResponse!

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      googlePlaceId: true, googleApiKey: true,
      googleRefreshToken: true, googleAccountId: true,
      googleLocationId: true, googlePreferOAuth: true,
    },
  })

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  let reviews: any[] = []
  let error: string | undefined
  let source = 'none'

  // Fetch reviews using a single Access Token retrieve
  if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
    try {
      const accessToken = await getGoogleAccessToken(brand.googleRefreshToken)
      const realAccountId = await resolveAndSaveRealAccountId(brand.id, accessToken, brand.googleAccountId)
      const res = await fetchGoogleGBPReviews(realAccountId, brand.googleLocationId, accessToken)
      if (res.error) {
        error = res.error
      } else {
        reviews = res.reviews
        source = 'google_business_profile_oauth'
      }
    } catch (e: any) {
      console.error('[Google Reviews API] Direct OAuth fetch failed, trying API Key fallback...', e)
      error = e.message
    }
  }

  // Fallback to Google Places API Key
  if (reviews.length === 0 && brand.googlePlaceId && brand.googleApiKey) {
    const res = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
    if (res.error) {
      error = res.error
    } else {
      reviews = res.reviews
      source = 'google_places_api'
    }
  }

  if (reviews.length === 0 && error) {
    return NextResponse.json({ error }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    source,
    reviewsCount: reviews.length,
    reviews,
  })
}

/**
 * POST /api/integrations/google/reviews?brandId=<id>
 * WRITE OPERATION: Fetches reviews, executes AI auto-replies (OAuth/PostFast),
 * creates Kanban ActionItems for bad reviews, and sends Lark Alerts.
 */
export async function POST(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) return NextResponse.json({ error: 'brandId required' }, { status: 400 })

  const auth = await authenticateAndAuthorize(request, brandId)
  if (!auth.authorized) return auth.errorResponse!

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true, name: true,
      googlePlaceId: true, googleApiKey: true,
      googleRefreshToken: true, googleAccountId: true,
      googleLocationId: true, googlePreferOAuth: true,
      postfastApiKey: true,
      larkBotWebhook: true,
    },
  })

  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  let reviews: any[] = []
  let error: string | undefined
  let source = 'none'
  let googleAccessToken: string | null = null

  // Fetch reviews (Retrieving Google OAuth access token ONCE for the entire request)
  if (brand.googlePreferOAuth && brand.googleRefreshToken && brand.googleLocationId) {
    try {
      googleAccessToken = await getGoogleAccessToken(brand.googleRefreshToken)
      const realAccountId = await resolveAndSaveRealAccountId(brand.id, googleAccessToken, brand.googleAccountId)
      const res = await fetchGoogleGBPReviews(realAccountId, brand.googleLocationId, googleAccessToken)
      if (res.error) {
        error = res.error
      } else {
        reviews = res.reviews
        source = 'google_business_profile_oauth'
      }
    } catch (e: any) {
      console.error('[Google Reviews API] Direct OAuth fetch failed, trying API Key fallback...', e)
      error = e.message
    }
  }

  // Fallback to Google Places API Key
  if (reviews.length === 0 && brand.googlePlaceId && brand.googleApiKey) {
    const res = await fetchGoogleReviews(brand.googlePlaceId, brand.googleApiKey)
    if (res.error) {
      error = res.error
    } else {
      reviews = res.reviews
      source = 'google_places_api'
    }
  }

  if (reviews.length === 0 && error) {
    return NextResponse.json({ error }, { status: 502 })
  }

  if (reviews.length === 0) {
    return NextResponse.json({ reviews: [], message: 'Google Business integration is not configured or no reviews found.' })
  }

  const newAlerts: string[] = []
  const autoRepliesSent: string[] = []

  // Resolve real account ID once if we have oauth access token
  let resolvedAccountId = brand.googleAccountId || 'primary'
  if (googleAccessToken) {
    resolvedAccountId = await resolveAndSaveRealAccountId(brand.id, googleAccessToken, brand.googleAccountId)
  }

  // Process auto-replies and alerts
  for (const review of reviews) {
    // 1. Check if the review has already been replied to
    const hasExistingReply = !!review.replyText

    if (!hasExistingReply) {
      // For bad reviews (<= 3 stars), append the customer game link as compensation
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || url.origin
      const compensationLink = review.rating <= 3 ? `${appUrl}/game/${brandId}` : undefined
      const replyText = await generateReviewReply(review.comment, review.rating, review.reviewer, brand.name, compensationLink)
      
      let replied = false
      let engine = 'none'

      // Attempt Direct OAuth Reply (reusing the already fetched googleAccessToken)
      if (googleAccessToken && brand.googleLocationId) {
        try {
          const result = await replyGoogleGBPReview({
            accountId: resolvedAccountId,
            locationId: brand.googleLocationId,
            reviewId: review.reviewId,
            replyText,
            accessToken: googleAccessToken,
          })
          if (result.success) {
            replied = true
            engine = 'google_business_profile_oauth'
          }
        } catch (e) {
          console.error('[Google Auto-Reply] Direct OAuth reply failed', e)
        }
      }

      // Fallback: Attempt PostFast Reply
      if (!replied && brand.postfastApiKey) {
        try {
          const { postfastReplyReview } = await import('@/lib/integrations/postfast')
          const result = await postfastReplyReview({
            apiKey: brand.postfastApiKey,
            platform: 'google',
            reviewId: review.reviewId,
            replyText,
          })
          if (result.success) {
            replied = true
            engine = 'postfast'
          }
        } catch (e) {
          console.error('[Google Auto-Reply] PostFast reply failed', e)
        }
      }

      if (replied) {
        review.replyText = replyText
        review.replyTime = new Date().toISOString()
        autoRepliesSent.push(review.reviewId)
        console.log(`[Auto-Reply Success] Replied to review ${review.reviewId} via ${engine}: "${replyText}"`)
      }
    }

    // 2. Create ActionItem for negative reviews (<= 3 stars)
    if (review.rating <= 3) {
      const existing = await prisma.actionItem.findFirst({
        where: {
          brandId,
          type: 'sentiment_alert',
          payload: { path: ['reviewId'], equals: review.reviewId },
        },
      })
      if (existing) continue

      const hasRepliedText = !!review.replyText
      const itemTitle = hasRepliedText
        ? `收到 Google【${review.rating}★ 差评】已由 AI 自动响应`
        : `收到 Google【${review.rating}★ 差评】需立即回复`

      const item = await prisma.actionItem.create({
        data: {
          brandId,
          type: 'sentiment_alert',
          priority: review.rating <= 2 ? 'urgent' : 'high',
          title: itemTitle,
          description: `"${review.comment.slice(0, 120)}..." — ${review.reviewer}`,
          payload: {
            reviewId: review.reviewId,
            reviewer: review.reviewer,
            rating: review.rating,
            reviewText: review.comment,
            createTime: review.createTime,
            replyText: review.replyText ?? '',
            replyTime: review.replyTime ?? '',
            suggestedReplies: [],
          },
          status: 'pending',
        },
      })
      newAlerts.push(item.id)

      // Send Lark notification if webhook configured
      if (brand.larkBotWebhook) {
        const larkMessage = hasRepliedText
          ? `**${review.reviewer}** 给出了 **${review.rating}★** 的评价：\n\n"${review.comment.slice(0, 200)}"\n\n🤖 *AI 已自动回复该评价，并向客户发送了补偿转盘链接。*`
          : `**${review.reviewer}** 给出了 **${review.rating}★** 的评价：\n\n"${review.comment.slice(0, 200)}"`

        sendLarkWebhookNotification({
          webhookUrl: brand.larkBotWebhook,
          title: `⚠️ Google 差评预警 — ${brand.name}`,
          content: larkMessage,
          actionUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/dashboard`,
          urgent: review.rating <= 2,
        }).catch(console.error)
      }
    }
  }

  if (newAlerts.length > 0) eventEmitter.emit('board_update')

  return NextResponse.json({
    ok: true,
    source,
    reviewsCount: reviews.length,
    newAlertsCreated: newAlerts.length,
    autoRepliesSentCount: autoRepliesSent.length,
    reviews,
  })
}
