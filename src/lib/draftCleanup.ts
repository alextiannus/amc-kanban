import { prisma } from './prisma.ts'

export const AI_DRAFT_PLACEHOLDER = '【AI 正在创作中...】'

export function isAiDraftPlaceholder(caption?: string | null): boolean {
  return (caption || '').includes('【AI 正在创作中')
}

function hasPublishRecord(draft: {
  platformPostId?: string | null
  postUrl?: string | null
  publishedAt?: Date | string | null
}): boolean {
  return Boolean(draft.platformPostId || draft.postUrl || draft.publishedAt)
}

export async function cleanupDisposableAiPlaceholderDraft(input: {
  brandId: string
  draftId: string
  reason?: string
}): Promise<boolean> {
  const draft = await prisma.contentDraft.findFirst({
    where: { id: input.draftId, brandId: input.brandId },
    select: {
      id: true,
      caption: true,
      status: true,
      platformPostId: true,
      postUrl: true,
      publishedAt: true,
    },
  })

  if (!draft || !isAiDraftPlaceholder(draft.caption) || hasPublishRecord(draft)) {
    return false
  }

  await prisma.$transaction(async (tx: any) => {
    await tx.actionItem.deleteMany({ where: { draftId: input.draftId } })
    await tx.contentAssetRef.deleteMany({ where: { draftId: input.draftId } })
    await tx.contentDraft.delete({ where: { id: input.draftId } })
  })

  console.log(
    `[draft-cleanup] Deleted disposable AI placeholder draft ${input.draftId}` +
    (input.reason ? `: ${input.reason}` : '')
  )
  return true
}
