import type { IndustryVertical } from 'amc-content'
import { prisma } from '../prisma.ts'
import { tryGenerateWithAmcContent } from './legacyCopywriterBridge.ts'
import { tryGenerateWithRemoteContentService } from './remoteContentService.ts'

export type ContentGenerationRequest = {
  brandId: string
  platform: string
  theme?: string
  idea?: string
  industryVertical?: IndustryVertical
  angle?: string
  customerIntent?: string
  offerType?: string
  targetEmotion?: string
  formatHint?: string
  locationFocus?: string
  localProof?: string[]
  mustMention?: string[]
  mustAvoid?: string[]
  mediaUrls?: string[]
  assetIds?: string[]
  copywriterId?: string
  copywriterName?: string
  draftId?: string | null
  taskId?: string | null
  fallbackToLegacy?: boolean
  actorId?: string
  actorType?: string
  actorRole?: string
}

export type ContentGenerationResult = {
  caption: string
  hashtags: string[]
  contentEngine: 'amc-content-remote' | 'amc-content' | 'legacy-copywriter' | 'rule-based-fallback'
  fallbackUsed: boolean
  fallbackReason?: string
  quality?: unknown
  provenance?: unknown
}

export async function generateContentWithFallback(
  input: ContentGenerationRequest,
): Promise<ContentGenerationResult> {
  let remoteFallbackReason: string | undefined
  try {
    const remote = await tryGenerateWithRemoteContentService(input)
    if (remote) return remote
  } catch (err: any) {
    remoteFallbackReason = err?.message || String(err)
    console.warn('[ContentGenerationService] remote amc-content failed; falling back local:', remoteFallbackReason)
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
  const attachedAssets = mediaUrls.length
    ? await prisma.mediaAsset.findMany({
      where: {
        brandId: input.brandId,
        url: { in: mediaUrls },
      },
    })
    : []

  const theme = input.theme || input.idea || task?.title || brand.description || `${brand.name} local service update`

  try {
    const result = await tryGenerateWithAmcContent({
      brand,
      platform: input.platform,
      industryVertical: input.industryVertical,
      task,
      userPrompt: theme,
      creativeHooks: input.angle,
      marketingStrategy: input.angle,
      offerType: input.offerType,
      customerIntent: input.customerIntent,
      targetEmotion: input.targetEmotion,
      formatHint: input.formatHint,
      locationFocus: input.locationFocus,
      localProof: input.localProof,
      mustMention: input.mustMention,
      mustAvoid: input.mustAvoid,
      draftId: input.draftId,
      mediaUrls,
      attachedAssets: attachedAssets.map((asset: any) => ({
        id: asset.id,
        url: asset.url,
        mimeType: asset.mimeType,
        aiTags: asset.aiTags,
        aiCategory: asset.aiCategory,
        aiCaption: asset.aiCaption,
      })),
      assigneeId: input.actorId,
    })

    if (!result) {
      throw new Error(`Unsupported platform for amc-content: ${input.platform}`)
    }

    return {
      caption: result.caption,
      hashtags: result.hashtags,
      contentEngine: 'amc-content',
      fallbackUsed: false,
      quality: result.quality,
      provenance: result.provenance,
    }
  } catch (err: any) {
    const localFallbackReason = err?.message || String(err)
    const fallbackReason = remoteFallbackReason
      ? `remote: ${remoteFallbackReason}; local: ${localFallbackReason}`
      : localFallbackReason
    if (input.fallbackToLegacy === false) {
      throw err
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
      fallbackReason,
      quality: legacy.quality,
      provenance: legacy.provenance,
    }
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
