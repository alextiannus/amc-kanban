import type { Prisma } from '@prisma/client'
import { orderedDraftMedia } from './draftMedia'
import { SHORT_VIDEO_CAROUSEL, shortVideoIssue } from './shortVideoCarousel'
import { mediaKind } from './socialMediaComposition'
import { blockingMediaIssues } from './mediaValidation'
import { validateDraftMediaForPlatform } from './publishMediaValidation'

export function parseDraftMediaMode(value: unknown) {
  return value === undefined || value === null || value === SHORT_VIDEO_CAROUSEL ? value : false
}

export class ShortVideoDraftError extends Error {}

export async function validateShortVideoDraft(
  db: Pick<Prisma.TransactionClient, 'mediaAsset'>,
  input: {
    platform: string; brandId: string; mediaUrls: string[]; assetIds: string[];
    status: string; instagramPublishType?: string | null; verifyReadable?: boolean
  },
) {
  if (input.instagramPublishType && input.instagramPublishType !== 'TIMELINE') {
    throw new ShortVideoDraftError('多段视频须使用 Instagram 轮播发布。')
  }
  const assets = input.assetIds.length ? await db.mediaAsset.findMany({
    where: { brandId: input.brandId, id: { in: input.assetIds } },
    select: { id: true, url: true, mimeType: true, filename: true, sourceType: true, sizeBytes: true, technicalMetadata: true },
  }) : []
  if (assets.length !== new Set(input.assetIds).size) throw new ShortVideoDraftError('部分素材在当前品牌下不可用。')
  const assetRefs = assets.map(asset => ({ asset }))
  const media = orderedDraftMedia({ mediaUrls: input.mediaUrls, assetRefs })
  const issue = shortVideoIssue(input.platform, media.map(mediaKind), !['draft', 'rejected'].includes(input.status))
  if (issue) throw new ShortVideoDraftError(issue.zh)
  if (input.verifyReadable) {
    const issues = await validateDraftMediaForPlatform({
      platform: input.platform, instagramPublishType: 'TIMELINE', mediaMode: SHORT_VIDEO_CAROUSEL,
      mediaUrls: input.mediaUrls, assetRefs,
    })
    const [blocking] = blockingMediaIssues(issues)
    if (blocking) throw new ShortVideoDraftError(`${blocking.filename} · ${blocking.message}`)
  }
}
