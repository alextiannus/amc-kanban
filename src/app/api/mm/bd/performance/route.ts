import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isAmcOperator } from '@/lib/amcOperator'

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 1. Verify User Business Role is BD or ADMIN
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
    // 2. Load BD user & self-heal/generate inviteCode if missing
    let user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { inviteCode: true, nickname: true, email: true }
    })

    let inviteCode = user?.inviteCode
    if (!inviteCode) {
      const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase()
      inviteCode = `AMC-${randomStr}`
      await prisma.user.update({
        where: { id: session.user.id },
        data: { inviteCode }
      })
    }

    // 3. Load referred merchants and their brands + subscriptions
    const referredUsers = await prisma.user.findMany({
      where: { referredById: session.user.id },
      select: {
        id: true,
        email: true,
        nickname: true,
        createdAt: true,
        ownedBrands: {
          select: {
            brand: {
              select: {
                id: true,
                name: true,
                subscriptions: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: {
                    id: true,
                    planName: true,
                    totalDueUsd: true,
                    status: true,
                    contractEndDate: true
                  }
                }
              }
            }
          }
        }
      }
    })

    // 4. Calculate KPIs
    const totalOnboarded = referredUsers.length
    let activeSubscriptions = 0
    let totalActiveSubscriptionVolume = 0

    const formattedBrands = referredUsers.map((u: any) => {
      // Find the first brand owned by this user
      const firstBrandOwner = u.ownedBrands[0]
      const brand = firstBrandOwner?.brand
      const subscription = brand?.subscriptions[0]

      const isActive = subscription?.status === 'ACTIVE'
      if (isActive) {
        activeSubscriptions++
        totalActiveSubscriptionVolume += subscription.totalDueUsd
      }

      return {
        merchantId: u.id,
        merchantEmail: u.email,
        merchantName: u.nickname || u.email.split('@')[0],
        brandId: brand?.id || null,
        brandName: brand?.name || '未绑定品牌',
        planName: subscription?.planName || '无订阅套餐',
        status: subscription?.status || 'INACTIVE',
        price: subscription?.totalDueUsd || 0,
        expiresAt: subscription?.contractEndDate ? subscription.contractEndDate.toISOString() : null,
        createdAt: u.createdAt.toISOString()
      }
    })

    const estimatedCommission = Math.round(totalActiveSubscriptionVolume * 0.20)

    // 5. Generate mock historical time-series for Recharts
    const monthNames = ['1月', '2月', '3月', '4月', '5月', '6月']
    const commissionHistory = monthNames.map((m, idx) => ({
      name: m,
      commission: Math.round(estimatedCommission * (0.4 + idx * 0.12))
    }))

    return NextResponse.json({
      inviteCode,
      kpis: {
        totalOnboarded,
        activeSubscriptions,
        estimatedCommission
      },
      brands: formattedBrands,
      chartData: commissionHistory
    })
  } catch (err: any) {
    console.error('[bd_performance_api] GET failed:', err)
    return NextResponse.json({ error: 'Internal Server Error', details: String(err) }, { status: 500 })
  }
}
