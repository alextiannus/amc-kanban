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
 * 2. "Connect accounts" (COMPLETE_CONFIG):
 *    - Triggered immediately after a brand has an active subscription,
 *      while it is missing one or more of: Google Maps, TikTok, Instagram.
 *    - If a PostFast API key is available, a fresh connect link is attached.
 *    - Dismissed/Removed once all three platforms are connected for that brand.
 */
export async function syncSetupNotifications(userId: string): Promise<SetupNotification[]> {
  // Check if the user is an Admin/AMC Operator
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  })
  const isAdmin = user?.role === 'ADMIN'

  let brands = []
  if (isAdmin) {
    brands = await prisma.brand.findMany({
      where: {
        status: { not: 'ARCHIVED' }
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
  } else {
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

    brands = await prisma.brand.findMany({
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
  }

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
          status: 'UNREAD',
          actionUrl: '/dashboard?action=create_brand'
        }
      })
    }
  } else {
    // Delete setup brand notifications since they now have a brand + subscription
    await prisma.notification.deleteMany({
      where: { userId, type: 'SETUP_BRAND' }
    })
  }

  // --- Process Check (b): Connect social accounts ---
  for (const brand of brands) {
    const hasSubscription = brand.subscriptions.length > 0
    const hasPostfast = !!brand.postfastApiKey

    if (hasSubscription) {
      // Ensure PostFast public connect link is up to date (updated every 7 days)
      let connectLink = brand.postfastConnectLink
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      if (hasPostfast && (
        !connectLink || 
        !brand.postfastConnectLinkUpdatedAt || 
        brand.postfastConnectLinkUpdatedAt < sevenDaysAgo
      )) {
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
        const actionUrl = '/dashboard?action=connect_accounts'
        const message = connectLink
          ? `您的品牌【${brand.name}】已完成订阅并开通试用。下一步请绑定 ${missingStr} 账号，以启用 AI 自动发布与数据分析。`
          : `您的品牌【${brand.name}】已完成订阅并开通试用。下一步请绑定 ${missingStr} 账号；连接链接准备好后会在这里显示。`
        
        const existing = await prisma.notification.findFirst({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONFIG' }
        })

        if (!existing) {
          await prisma.notification.create({
            data: {
              userId,
              brandId: brand.id,
              type: 'COMPLETE_CONFIG',
              title: '下一步：绑定账号',
              message,
              status: 'UNREAD',
              actionUrl
            }
          })
        } else if (existing.title !== '下一步：绑定账号' || existing.message !== message || existing.actionUrl !== actionUrl) {
          await prisma.notification.update({
            where: { id: existing.id },
            data: { title: '下一步：绑定账号', message, status: 'UNREAD', actionUrl }
          })
        }
      } else {
        // Connected all 3: clean up notification if any exists
        await prisma.notification.deleteMany({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONFIG' }
        })
      }
    } else {
      // Brand is not active/subscribed, so connection notification is not relevant yet.
      await prisma.notification.deleteMany({
        where: { userId, brandId: brand.id, type: 'COMPLETE_CONFIG' }
      })
    }

    // --- Process Check (c): Complete Brand Context configuration ---
    // Only prompt for brand story AFTER the user has connected at least one social account.
    // This avoids overwhelming new users with too many setup prompts at once.
    const hasAnyAccount = brand.accounts.length > 0
    if (hasSubscription && hasAnyAccount) {
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
              status: 'UNREAD',
              actionUrl: '/dashboard?action=brand_story'
            }
          })
        } else if (existing.message !== message || !existing.actionUrl) {
          await prisma.notification.update({
            where: { id: existing.id },
            data: { message, status: 'UNREAD', actionUrl: '/dashboard?action=brand_story' }
          })
        }
      } else {
        // All context settings are complete: clean up notification if any exists
        await prisma.notification.deleteMany({
          where: { userId, brandId: brand.id, type: 'COMPLETE_CONTEXT' }
        })
      }
    } else {
      // No subscription, or no accounts connected yet: remove brand context notification
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
    actionUrl: n.actionUrl || null,
    // Legacy field: postfast external connect URL, kept for backward compatibility
    connectUrl: n.brand?.postfastConnectLink || null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt
  }))
}
