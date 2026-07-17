import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

// Copy-paste syncSetupNotifications implementation from notificationService.ts
async function syncSetupNotifications(userId) {
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
    const crewMembers = await prisma.crewMember.findMany({
      where: { userId, active: true },
      select: { crewId: true }
    })
    const crewIds = crewMembers.map((m) => m.crewId)

    const orgMemberships = await prisma.organizationMember.findMany({
      where: { memberId: userId },
      select: { ownerId: true }
    })
    const orgOwnerIds = orgMemberships.map((m) => m.ownerId)

    const queryOr = [
      { crew: { id: { in: crewIds } } }
    ]

    if (orgOwnerIds.length > 0) {
      const orgOwnerCrewMembers = await prisma.crewMember.findMany({
        where: { userId: { in: orgOwnerIds }, active: true },
        select: { crewId: true }
      })
      const orgOwnerCrewIds = orgOwnerCrewMembers.map((m) => m.crewId)
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

  // --- Process Check (b): Complete Account configuration ---
  for (const brand of brands) {
    const hasSubscription = brand.subscriptions.length > 0
    const hasPostfast = !!brand.postfastApiKey

    if (hasSubscription && hasPostfast) {
      const connectedPlatforms = new Set(
        brand.accounts.map((acc) => acc.platformId.toLowerCase())
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

      const missing = []
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
          console.log(`Notification created for brand: ${brand.name}`);
        } else {
          console.log(`Notification already exists for brand: ${brand.name}`);
        }
      }
    }
  }
}

async function run() {
  try {
    await syncSetupNotifications('cmoxpnjvu0000n028n442r90w');
    console.log('Sync job completed successfully!');
  } catch (err) {
    console.error('Sync error:', err);
  } finally {
    await prisma.$disconnect();
  }
}
run();
