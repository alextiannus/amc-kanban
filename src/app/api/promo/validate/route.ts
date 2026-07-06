import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { code, planId } = await request.json() as { code?: string; planId?: string }
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ valid: false, error: '请输入有效的验证码' })
    }

    const normalizedCode = code.trim().toUpperCase()

    // 1. Try to find a CampaignPromoCode first
    const campaign = await prisma.campaignPromoCode.findUnique({
      where: { code: normalizedCode },
      include: { owner: true }
    })

    if (campaign) {
      // Validate constraints
      if (!campaign.isActive) {
        return NextResponse.json({ valid: false, error: '该优惠码已被禁用' })
      }
      if (campaign.expiresAt && new Date(campaign.expiresAt) < new Date()) {
        return NextResponse.json({ valid: false, error: '该优惠码已过期' })
      }
      if (campaign.maxUses !== null && campaign.usedCount >= campaign.maxUses) {
        return NextResponse.json({ valid: false, error: '该优惠码的使用额度已用尽' })
      }

      return NextResponse.json({
        valid: true,
        codeType: 'CAMPAIGN_PROMO',
        discountType: campaign.discountType, // "PERCENT" | "FIXED_AMOUNT"
        discountValue: campaign.discountValue,
        description: campaign.description || `${campaign.name} 专属优惠`,
        campaignId: campaign.id
      })
    }

    // 2. Try to find a User inviteCode
    const userReferrer = await prisma.user.findUnique({
      where: { inviteCode: normalizedCode }
    })

    if (userReferrer) {
      if (userReferrer.id === session.user.id) {
        return NextResponse.json({ valid: false, error: '不能使用自己的邀请码' })
      }

      if (userReferrer.email === 'alextiannus@gmail.com' && planId === 'starter') {
        return NextResponse.json({
          valid: true,
          codeType: 'USER_INVITE',
          discountType: 'FIXED_AMOUNT',
          discountValue: 200,
          description: `来自用户 ${userReferrer.nickname || userReferrer.email} 的邀请特惠 (Starter套餐特惠价 $400/月)`,
          referrerId: userReferrer.id
        })
      }

      // Default referral discount: 10% off
      return NextResponse.json({
        valid: true,
        codeType: 'USER_INVITE',
        discountType: 'PERCENT',
        discountValue: 10,
        description: `来自用户 ${userReferrer.nickname || userReferrer.email} 的邀请特惠 (10% 折扣)`,
        referrerId: userReferrer.id
      })
    }

    return NextResponse.json({ valid: false, error: '未找到该邀请码或优惠码' })
  } catch (err: any) {
    console.error('[PromoValidateAPI] error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
