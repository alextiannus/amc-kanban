import { prisma } from '@/lib/prisma'
import { postfastGenerateConnectLink } from '@/lib/integrations/postfast'

export interface SetupNotification {
  id: string
  userId: string
  brandId?: string | null
  type: string
  title: string
  message: string
  status: string
  connectUrl?: string | null
  createdAt: Date
  updatedAt: Date
}

/**
 * Audit and synchronize onboarding/setup notifications for a specific user.
 * 
 * Rules:
 * 1. "Set up your first brand" (SETUP_BRAND):
 *    - Triggered if the user has 0 brands OR none of the user's brands has an active subscription.
 *    - Dismissed/Removed once they have at least one brand with an active subscription.
 * 
 * 2. "Complete Account configuration" (COMPLETE_CONFIG):
 *    - Triggered if a brand has an active subscription and postfastApiKey,
 *      but is missing one or more of: Google Maps, TikTok, Instagram.
 *    - Dismissed/Removed once all three platforms are connected for that brand.
 */
export async function syncSetupNotifications(userId: string): Promise<SetupNotification[]> {
  // 1. Fetch user's brands and active subscriptions
  // In amc-kanban, a brand belongs to a user if they are a crew member.
  const crewMembers = await prisma.crewMember.findMany({
    where: { userId, active: true },
    select: { crewId: true }
  })
  const crewIds = crewMembers.map((m: any) => m.crewId)

  // Also check organization cascade:
  const orgMemberships = await prisma.organizationMember.findMany({
    where: { memberId: userId },
    select: { ownerId: true }
  })
  const orgOwnerIds = orgMemberships.map((m: any) => m.ownerId)

  const queryOr: any[] = [
    { crew: { id: { in: crewIds } } }
  ]

  if (orgOwnerIds.length > 0) {
    // Fetch crewIds for organization owners
    const orgOwnerCrewMembers = await prisma.crewMember.findMany({
      where: { userId: { in: orgOwnerIds }, active: true },
      select: { crewId: true }
    })
    const orgOwnerCrewIds = orgOwnerCrewMembers.map((m: any) => m.crewId)
    if (orgOwnerCrewIds.length > 0) {
      queryOr.push({ crew: { id: { in: orgOwnerCrewIds } } })
    }
  }

  const brands = await prisma.brand.findMany({
    where: {
      status: { not: 'ARCHIVED' },
      OR: queryOr
    },
    include: {
      accounts: true,
      knowledge: true,
      subscriptions: {
        where: {
          status: 'ACTIVE',
          OR: [
            { contractEndDate: null },
            { contractEndDate: { gt: new Date() } }
          ]
        }
      }
    }
  })

  const hasBrandWithSubscription = brands.some((brand: any) => brand.subscriptions.length > 0)

  // --- Process Check (a): Set up your first brand ---
  if (!hasBrandWithSubscription) {
    const existing = await prisma.notification.findFirst({
      where: { userId, type: 'SETUP_BRAND' }
    })
    if (!existing) {
      await prisma.notification.create({
        data: {
          userId,
          type: 'SETUP_BRAND',
          title: '创建您的第一个品牌',
          message: '请开始创建您的第一个品牌并激活订阅，开启您的 AI 社交媒体营销之旅。',
          status: 'UNREAD'
        }
      })
    }
  } else {
    // Delete setup brand notifications since they now have a brand + subscription
    await prisma.notification.deleteMany({
      where: { userId, type: 'SETUP_BRAND' }
    })
  }

  // --- Process Check (b): Complete Account configuration ---
  for (const brand of brands) {
    const hasSubscription = brand.subscriptions.length > 0
    const hasPostfast = !!brand.postfastApiKey

    if (hasSubscription && hasPostfast) {
      // Ensure PostFast public connect link is up to date (updated every 7 days)
      let connectLink = brand.postfastConnectLink
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      if (
        !connectLink || 
        !brand.postfastConnectLinkUpdatedAt || 
        brand.postfastConnectLinkUpdatedAt < sevenDaysAgo
      ) {
        try {
          const pfLinkResult = await postfastGenerateConnectLink(brand.postfastApiKey!)
          if (pfLinkResult.success && pfLinkResult.connectUrl) {
            connectLink = pfLinkResult.connectUrl
            await prisma.brand.update({
              where: { id: brand.id },
              data: {
                postfastConnectLink: connectLink,
                postfastConnectLinkUpdatedAt: new Date(),
              }
            })
            console.log(`[Notification Service] Successfully updated PostFast connect link for brand ${brand.id}`)
          }
        } catch (pfLinkErr) {
          console.error('[Notification Service] Failed to generate/save PostFast connect link:', pfLinkErr)
        }
      }

      // Check connections for: Google Maps, TikTok, Instagram
      const connectedPlatforms = new Set(
        brand.accounts.map((acc: any) => acc.platformId.toLowerCase())
      )

      const hasGoogle = 
        !!brand.googlePlaceId || 
        !!brand.googleLocationId || 
        connectedPlatforms.has('google') ||
        connectedPlatforms.has('google_maps') ||
        connectedPlatforms.has('gbp') ||
        connectedPlatforms.has('gmb')

      const hasTiktok = connectedPlatforms.has('tiktok')
      const hasInstagram = connectedPlatforms.has('instagram')

      const missing: string[] = []
      if (!hasGoogle) missing.push('Google Maps')
      if (!hasTiktok) missing.push('TikTok')
      if (!hasInstagram) missing.push('Instagram')

      if (missing.length > 0) {
        const missingStr = missing.join('、')
        const message = `您的品牌【${brand.name}】已激活订阅，但尚未绑定 ${missingStr} 账号。请绑定以启用 AI 自动发布与数据分析。`
        
        const existing = await prisma.notification.findFirst({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONFIG' }
        })

        if (!existing) {
          await prisma.notification.create({
            data: {
              userId,
              brandId: brand.id,
              type: 'COMPLETE_CONFIG',
              title: '完善您的账号配置',
              message,
              status: 'UNREAD'
            }
          })
        } else if (existing.message !== message) {
          await prisma.notification.update({
            where: { id: existing.id },
            data: { message, status: 'UNREAD' }
          })
        }
      } else {
        // Connected all 3: clean up notification if any exists
        await prisma.notification.deleteMany({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONFIG' }
        })
      }
    } else {
      // Brand is not active/subscribed or missing postfast key, connection notification is not relevant.
      await prisma.notification.deleteMany({
        where: { userId, brandId: brand.id, type: 'COMPLETE_CONFIG' }
      })
    }

    // --- Process Check (c): Complete Brand Context configuration ---
    if (hasSubscription) {
      const hasDesc = !!brand.description?.trim()
      const hasTone = !!brand.knowledge?.brandTone?.trim()
      const hasVoice = !!brand.knowledge?.voiceId?.trim()

      if (!hasDesc || !hasTone || !hasVoice) {
        const missing: string[] = []
        if (!hasDesc) missing.push('品牌故事简介')
        if (!hasTone) missing.push('内容风格声调')
        if (!hasVoice) missing.push('AI 语音音色')
        const missingStr = missing.join('、')
        const message = `您的品牌【${brand.name}】尚未完善 ${missingStr}。请前往“品牌故事”补充以让您的 AI 助手更贴合品牌形象。`

        const existing = await prisma.notification.findFirst({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONTEXT' }
        })

        if (!existing) {
          await prisma.notification.create({
            data: {
              userId,
              brandId: brand.id,
              type: 'COMPLETE_CONTEXT',
              title: '完善品牌故事与声音',
              message,
              status: 'UNREAD'
            }
          })
        } else if (existing.message !== message) {
          await prisma.notification.update({
            where: { id: existing.id },
            data: { message, status: 'UNREAD' }
          })
        }
      } else {
        // All context settings are complete: clean up notification if any exists
        await prisma.notification.deleteMany({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONTEXT' }
        })
      }
    } else {
      await prisma.notification.deleteMany({
        where: { userId, brandId: brand.id, type: 'COMPLETE_CONTEXT' }
      })
    }
  }

  // 2. Return all active notifications for the user
  const activeNotifications = await prisma.notification.findMany({
    where: {
      userId,
      status: { not: 'DISMISSED' }
    },
    include: {
      brand: {
        select: {
          postfastConnectLink: true
        }
      }
    },
    orderBy: {
      createdAt: 'desc'
    }
  })

  return activeNotifications.map((n: any) => ({
    id: n.id,
    userId: n.userId,
    brandId: n.brandId,
    type: n.type,
    title: n.title,
    message: n.message,
    status: n.status,
    connectUrl: n.brand?.postfastConnectLink || null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  }))
}
