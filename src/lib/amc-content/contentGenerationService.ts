import { prisma } from '../prisma.ts'
import { tryGenerateWithRemoteContentService } from './remoteContentService.ts'
import type { ContentGenerationRequest, ContentGenerationResult } from './types.ts'

export async function generateContentWithFallback(
  input: ContentGenerationRequest,
): Promise<ContentGenerationResult> {
  let remoteFallbackReason: string | undefined
  try {
    const remote = await tryGenerateWithRemoteContentService(input)
    if (remote) return remote
  } catch (err: any) {
    remoteFallbackReason = err?.message || String(err)
    console.warn('[ContentGenerationService] remote amc-content failed; falling back legacy:', remoteFallbackReason)
  }

  const brand = await prisma.brand.findUnique({
    where: { id: input.brandId },
    include: { knowledge: true },
  })
  if (!brand) throw new Error('Brand not found')

  const task = input.taskId
    ? await prisma.workUnit.findUnique({ where: { id: input.taskId } })
    : null

  const mediaUrls = await resolveMediaUrls(input)
  const theme = input.theme || input.idea || task?.title || brand.description || `${brand.name} local service update`

  if (input.fallbackToLegacy === false) {
    throw new Error(remoteFallbackReason || 'amc-content service did not generate content')
  }

  const { copywriterNode } = await import('../../agents/nodes/copywriter.ts')
  const legacy = await copywriterNode({
    brandId: input.brandId,
    taskId: input.taskId,
    draftId: input.draftId,
    platform: input.platform,
    caption: theme,
    mediaUrls,
    assetIds: input.assetIds ?? [],
    copywriteOnly: true,
    assigneeId: input.actorId,
    marketingStrategy: input.angle,
    skipAmcContent: true,
  })

  return {
    caption: legacy.caption,
    hashtags: legacy.hashtags || [],
    contentEngine: legacy.aiFailed ? 'rule-based-fallback' : 'legacy-copywriter',
    fallbackUsed: true,
    fallbackReason: remoteFallbackReason,
    quality: legacy.quality,
    provenance: legacy.provenance,
  }
}

async function resolveMediaUrls(input: ContentGenerationRequest): Promise<string[]> {
  const urls = new Set<string>((input.mediaUrls ?? []).filter(Boolean))
  if (input.assetIds?.length) {
    const assets = await prisma.mediaAsset.findMany({
      where: {
        brandId: input.brandId,
        id: { in: input.assetIds },
      },
      select: { url: true },
    })
    for (const asset of assets) urls.add(asset.url)
  }
  return Array.from(urls)
}
