export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject, canOwnBrand } from '@/lib/brandAccess'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  const isPublic = url.searchParams.get('public') === 'true'

  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  // Auth check for non-public requests
  if (!isPublic) {
    const session = await getSession()
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const hasAccess = await canHumanAccessBrandProject(brandId, session.user.id, session.user.role)
    if (!hasAccess) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  try {
    let config = await prisma.gameConfig.findUnique({
      where: { brandId },
      include: {
        prizes: { orderBy: { createdAt: 'asc' } },
        brand: {
          select: {
            name: true,
            location: true,
            googlePlaceId: true,
            accounts: {
              select: {
                platformId: true,
                profileUrl: true,
                handle: true,
              },
            },
          },
        },
      },
    })

    // If config doesn't exist and it's a private request, initialize default settings
    if (!config && !isPublic) {
      config = await prisma.gameConfig.create({
        data: {
          brandId,
          title: '幸运大轮盘',
          description: '在社交媒体（Google Maps、小红书、Instagram）发表好评并上传截图即可获得5积分。每次抽奖消耗5积分。快来试试您的手气吧！',
          themeColor: '#3b82f6',
          taskPhotoEnabled: false,
          taskReviewEnabled: true,
          taskGoogleMapsEnabled: true,
          taskXiaohongshuEnabled: true,
          taskInstagramEnabled: true,
          clerkPin: '123456',
          maxSpinsPerUserDay: 3,
          templateType: 'WHEEL',
          posterTitle: 'Scan & Win!',
          posterDesc: 'Leave a review to spin and win rewards instantly!',
          posterTheme: 'black',
          prizes: {
            create: [
              { name: '九折优惠券', type: 'COUPON', probability: 0.3, totalInventory: null },
              { name: '免费咖啡', type: 'PHYSICAL', probability: 0.1, totalInventory: 20 },
              { name: '2个奖励积分', type: 'POINTS', probability: 0.2, totalInventory: null },
              { name: '谢谢参与', type: 'THANKS', probability: 0.4, totalInventory: null },
            ],
          },
        },
        include: {
          prizes: { orderBy: { createdAt: 'asc' } },
          brand: {
            select: {
              name: true,
              location: true,
              googlePlaceId: true,
              accounts: {
                select: {
                  platformId: true,
                  profileUrl: true,
                  handle: true,
                },
              },
            },
          },
        },
      })
    }

    if (!config) {
      return NextResponse.json({ error: 'Game config not found' }, { status: 404 })
    }

    // Security: Do not expose clerkPin on public API
    if (isPublic) {
      const { clerkPin, ...publicConfig } = config
      return NextResponse.json(publicConfig)
    }

    return NextResponse.json(config)
  } catch (e: any) {
    console.error('[GET /api/game/config]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const brandId = url.searchParams.get('brandId')
  if (!brandId) {
    return NextResponse.json({ error: 'brandId required' }, { status: 400 })
  }

  const hasAccess = await canOwnBrand(brandId, session.user.id)
  if (!hasAccess) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await request.json()
    const {
      title,
      description,
      themeColor,
      taskPhotoEnabled,
      taskReviewEnabled,
      clerkPin,
      maxSpinsPerUserDay,
      templateType,
      taskGoogleMapsEnabled,
      taskXiaohongshuEnabled,
      taskInstagramEnabled,
      posterTitle,
      posterDesc,
      posterTheme,
      prizes = [],
    } = body

    // We do a database transaction to update game config and upsert/delete its prizes
    const result = await prisma.$transaction(async (tx) => {
      // 1. Upsert GameConfig
      const config = await tx.gameConfig.upsert({
        where: { brandId },
        create: {
          brandId,
          title: title ?? '幸运大轮盘',
          description,
          themeColor: themeColor ?? '#3b82f6',
          taskPhotoEnabled: false,
          taskReviewEnabled: true,
          taskGoogleMapsEnabled: taskGoogleMapsEnabled ?? true,
          taskXiaohongshuEnabled: taskXiaohongshuEnabled ?? true,
          taskInstagramEnabled: taskInstagramEnabled ?? true,
          clerkPin: clerkPin ?? '123456',
          maxSpinsPerUserDay: maxSpinsPerUserDay ?? 3,
          templateType: templateType ?? 'WHEEL',
          posterTitle: posterTitle ?? 'Scan & Win!',
          posterDesc: posterDesc ?? 'Leave a review to spin and win rewards instantly!',
          posterTheme: posterTheme ?? 'black',
        },
        update: {
          title: title ?? '幸运大轮盘',
          description,
          themeColor: themeColor ?? '#3b82f6',
          taskPhotoEnabled: false,
          taskReviewEnabled: true,
          taskGoogleMapsEnabled: taskGoogleMapsEnabled ?? true,
          taskXiaohongshuEnabled: taskXiaohongshuEnabled ?? true,
          taskInstagramEnabled: taskInstagramEnabled ?? true,
          clerkPin: clerkPin ?? '123456',
          maxSpinsPerUserDay: maxSpinsPerUserDay ?? 3,
          templateType: templateType ?? 'WHEEL',
          posterTitle: posterTitle !== undefined ? posterTitle : undefined,
          posterDesc: posterDesc !== undefined ? posterDesc : undefined,
          posterTheme: posterTheme !== undefined ? posterTheme : undefined,
        },
      })

      // 2. Fetch current prizes to see which ones to delete
      const currentPrizes = await tx.gamePrize.findMany({
        where: { gameConfigId: config.id },
        select: { id: true },
      })
      const incomingIds = prizes.map((p: any) => p.id).filter(Boolean)
      const toDeleteIds = currentPrizes.map(p => p.id).filter(id => !incomingIds.includes(id))

      // Delete removed prizes
      if (toDeleteIds.length > 0) {
        await tx.gamePrize.deleteMany({
          where: { id: { in: toDeleteIds } },
        })
      }

      // 3. Upsert incoming prizes
      const updatedPrizes = []
      for (const p of prizes) {
        const prizeData = {
          name: p.name,
          type: p.type,
          probability: parseFloat(p.probability) || 0,
          totalInventory: p.totalInventory !== undefined && p.totalInventory !== '' ? parseInt(p.totalInventory) : null,
          imageUrl: p.imageUrl || null,
        }

        if (p.id) {
          const updated = await tx.gamePrize.update({
            where: { id: p.id },
            data: prizeData,
          })
          updatedPrizes.push(updated)
        } else {
          const created = await tx.gamePrize.create({
            data: {
              ...prizeData,
              gameConfigId: config.id,
            },
          })
          updatedPrizes.push(created)
        }
      }

      return {
        ...config,
        prizes: updatedPrizes,
      }
    })

    return NextResponse.json(result)
  } catch (e: any) {
    console.error('[POST /api/game/config]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
