import type { KnowledgeEntry, KnowledgeQuery, KnowledgeRepository } from 'amc-content'
import { prisma } from '../prisma.ts'

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, { expiresAt: number; entries: KnowledgeEntry[] }>()

export function createPrismaKnowledgeRepository(): KnowledgeRepository {
  return {
    async retrieve(input: KnowledgeQuery): Promise<KnowledgeEntry[]> {
      const limit = input.limit ?? 8
      const cacheKey = JSON.stringify({
        brandId: input.brandId,
        platform: input.platform,
        vertical: input.vertical,
        theme: input.theme,
        categories: input.categories,
        limit,
      })
      const cached = cache.get(cacheKey)
      if (cached && cached.expiresAt > Date.now()) return cached.entries

      const entries: KnowledgeEntry[] = []

      const feedback = await prisma.userCorrectionFeedback.findMany({
        where: {
          brandId: input.brandId,
          isApproved: true,
        },
        orderBy: { updatedAt: 'desc' },
        take: Math.min(limit, 5),
        select: {
          id: true,
          originalText: true,
          correctedText: true,
          diffRatio: true,
        },
      })

      for (const item of feedback) {
        entries.push({
          id: `feedback:${item.id}`,
          level: 'brand',
          platform: input.platform,
          vertical: input.vertical,
          category: 'example',
          title: 'Approved brand correction',
          content: [
            `Original AI draft: ${item.originalText}`,
            `Preferred published style: ${item.correctedText}`,
          ].join('\n'),
          qualityScore: Math.max(0.1, Math.min(1, 1 - item.diffRatio)),
        })
      }

      const annotatedLogs = await prisma.copywriterLog.findMany({
        where: {
          brandId: input.brandId,
          platform: input.platform,
          isAnnotated: true,
          trainingTag: 'include',
        },
        orderBy: { createdAt: 'desc' },
        take: Math.max(0, limit - entries.length),
        select: {
          id: true,
          userInput: true,
          correctedContent: true,
          rawOutput: true,
          rating: true,
        },
      })

      for (const log of annotatedLogs) {
        entries.push({
          id: `copywriter-log:${log.id}`,
          level: 'brand',
          platform: input.platform,
          vertical: input.vertical,
          category: 'example',
          title: log.userInput || 'Annotated copywriter example',
          content: log.correctedContent || log.rawOutput,
          qualityScore: log.rating ? log.rating / 3 : 0.75,
        })
      }

      const result = entries.slice(0, limit)
      cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, entries: result })
      return result
    },
  }
}
