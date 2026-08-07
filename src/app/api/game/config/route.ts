export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canHumanAccessBrandProject, canOwnBrand } from '@/lib/brandAccess'
import { hasPrizeIdentityChanged } from '@/lib/gamePrizes'

type GamePrizeInput = {
  id?: string
  name: string
  type: string
  probability?: number | string | null
  totalInventory?: number | string | null
  imageUrl?: string | null
}

function googleReviewAppUrlFromMeta(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const appReviewUrl = (value as Record<string, unknown>).appReviewUrl
  return typeof appReviewUrl === 'string' ? appReviewUrl : null
}

function exposeGoogleReviewAppUrl<T extends { brand: { googleLinksMeta: unknown } }>(config: T) {
  const { googleLinksMeta, ...brand } = config.brand
  return {
    ...config,
    brand: {
      ...brand,
      googleReviewAppUrl: googleReviewAppUrlFromMeta(googleLinksMeta),
    },
  }
}

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
            timezone: true,
            googlePlaceId: true,
            googleBusinessUrl: true,
            googleReviewUrl: true,
            googleLinksMeta: true,
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
          description: '本轮首次打开任一分享平台可获得 5 积分。系统不验证是否公开发布；每次抽奖消耗 5 积分。',
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
          posterDesc: 'Open any sharing platform once per activity round to receive 5 points.',
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
              timezone: true,
              googlePlaceId: true,
              googleBusinessUrl: true,
              googleReviewUrl: true,
              googleLinksMeta: true,
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

    const responseConfig = exposeGoogleReviewAppUrl(config)

    // Security: Do not expose clerkPin or the complete Google metadata on public API
    if (isPublic) {
      const publicConfig = {
        ...responseConfig,
        clerkPin: undefined,
      }
      return NextResponse.json(publicConfig)
    }

    return NextResponse.json(responseConfig)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    console.error('[GET /api/game/config]', e)
    return NextResponse.json({ error: message }, { status: 500 })
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
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
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
          posterDesc: posterDesc ?? 'Open any sharing platform once per activity round to receive 5 points.',
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

      // 2. Fetch current prizes to preserve identity only when name/type is unchanged.
      const currentPrizes = await tx.gamePrize.findMany({
        where: { gameConfigId: config.id },
        select: { id: true, name: true, type: true },
      })
      const typedPrizes: GamePrizeInput[] = Array.isArray(prizes) ? prizes : []
      const currentPrizeById = new Map<string, { id: string; name: string; type: string }>(
        currentPrizes.map((prize) => [prize.id, prize]),
      )
      const retainedPrizeIds = new Set<string>()

      // 3. Upsert incoming prizes
      const updatedPrizes = []
      for (const p of typedPrizes) {
        const prizeData = {
          name: p.name,
          type: p.type,
          probability: Number.parseFloat(String(p.probability ?? '0')) || 0,
          totalInventory: p.totalInventory !== undefined && p.totalInventory !== '' ? Number.parseInt(String(p.totalInventory), 10) : null,
          imageUrl: p.imageUrl || null,
        }

        if (p.id) {
          const existingPrize = currentPrizeById.get(p.id)
          if (!existingPrize) {
            throw new Error('Prize does not belong to this game configuration.')
          }

          if (hasPrizeIdentityChanged(existingPrize, prizeData)) {
            const created = await tx.gamePrize.create({
              data: {
                ...prizeData,
                gameConfigId: config.id,
              },
            })
            updatedPrizes.push(created)
          } else {
            const updated = await tx.gamePrize.update({
              where: { id: p.id },
              data: prizeData,
            })
            retainedPrizeIds.add(p.id)
            updatedPrizes.push(updated)
          }
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

      // Replaced and removed prizes can now be deleted safely. Issued rewards use spin snapshots.
      const toDeleteIds = currentPrizes
        .map((prize) => prize.id)
        .filter((id: string) => !retainedPrizeIds.has(id))
      if (toDeleteIds.length > 0) {
        await tx.gamePrize.deleteMany({
          where: { id: { in: toDeleteIds } },
        })
      }

      return {
        ...config,
        prizes: updatedPrizes,
      }
    })

    return NextResponse.json(result)
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal Server Error'
    console.error('[POST /api/game/config]', e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
