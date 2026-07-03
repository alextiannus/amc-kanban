import { PrismaClient } from '@prisma/client'
// Schedulers disabled — uncomment to re-enable background polling
// import { startCopywriterScheduler } from './copywriterScheduler.ts'
// import { startResearcherScheduler } from './researcherScheduler.ts'

const globalForPrisma = global as unknown as { prisma: any }

const basePrisma =
  globalForPrisma.prisma ||
  new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

// Helper function to mark media assets associated with specified drafts as '已使用'
async function markDraftAssetsAsUsed(draftIds: string[]) {
  if (draftIds.length === 0) return
  try {
    const assetRefs = await basePrisma.contentAssetRef.findMany({
      where: { draftId: { in: draftIds } },
      select: { assetId: true },
    })
    const assetIds = assetRefs.map((ref: { assetId: string }) => ref.assetId)
    if (assetIds.length > 0) {
      await basePrisma.mediaAsset.updateMany({
        where: { id: { in: assetIds } },
        data: { aiCategory: '已使用' },
      })
    }
  } catch (err) {
    console.error('[Prisma Extension] Error marking assets as used:', err)
  }
}

// Extend Prisma Client to hook into ContentDraft modifications
const extendedPrisma = basePrisma.$extends({
  query: {
    contentDraft: {
      async update({ args, query }: any) {
        const result = await query(args)
        const status = args.data?.status
        if (status === 'published' || status === 'scheduled' || status === 'publishing') {
          const draftId = args.where?.id
          if (draftId) {
            await markDraftAssetsAsUsed([draftId])
          }
        }
        return result
      },
      async updateMany({ args, query }: any) {
        const result = await query(args)
        const status = args.data?.status
        if (status === 'published' || status === 'scheduled' || status === 'publishing') {
          try {
            const drafts = await basePrisma.contentDraft.findMany({
              where: {
                ...args.where,
                status: { in: ['published', 'scheduled', 'publishing'] },
              },
              select: { id: true },
            })
            const draftIds = drafts.map((d: { id: string }) => d.id)
            await markDraftAssetsAsUsed(draftIds)
          } catch (err) {
            console.error('[Prisma Extension] Error in updateMany side effect:', err)
          }
        }
        return result
      },
      async create({ args, query }: any) {
        const result = await query(args)
        const status = args.data?.status
        if (status === 'published' || status === 'scheduled' || status === 'publishing') {
          const draftId = result?.id
          if (draftId) {
            await markDraftAssetsAsUsed([draftId])
          }
        }
        return result
      }
    }
  }
})

export const prisma = extendedPrisma

// Background schedulers disabled (noisy + unnecessary polling)
// startCopywriterScheduler()
// startResearcherScheduler()
