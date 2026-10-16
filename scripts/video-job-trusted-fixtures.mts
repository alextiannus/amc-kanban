import { createHmac } from 'node:crypto'
import { videoReceiptDigest } from '../src/lib/videoReceipt.ts'

export type TrustedVideoJobLanguage = 'zh' | 'bilingual'
export type TrustedVideoJobGenerationStage = 'reference_preparation' | 'video_generation'

/** Side-effect-free fixture shared by trusted-boundary contract tests. */
export function trustedVideoJobFixture(input: {
  id: string
  brandId: string
  actorId: string
  token: string
  language: TrustedVideoJobLanguage
  generationStage: TrustedVideoJobGenerationStage
}) {
  const projectId = `project-${input.id}`
  const revisions = [{ id: `revision-${input.id}`, status: 'complete' }]
  const issuedAt = new Date().toISOString()
  const receipt = {
    schemaVersion: 'amc-video-lineage@2',
    projectId,
    brandId: input.brandId,
    ownerId: input.actorId,
    editorActorId: input.actorId,
    editorDigest: videoReceiptDigest(null),
    historyDigest: videoReceiptDigest({ revisions, hasMore: false }),
    historyCursor: `cursor-${input.id}`,
    issuedAt,
  }
  return {
    id: input.id,
    brandId: input.brandId,
    title: `${input.language}-${input.generationStage}`,
    plan: {
      basicVideoProjectId: projectId,
      _mmVideoJob: {
        basicVideoProjectId: projectId,
        language: input.language,
        generationStage: input.generationStage,
        revisions,
        revisionsHasMore: false,
        videoReceipt: {
          ...receipt,
          signature: createHmac('sha256', input.token).update(JSON.stringify(receipt)).digest('hex'),
        },
      },
    },
  }
}
