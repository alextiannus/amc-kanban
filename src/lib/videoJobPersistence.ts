import type { Prisma } from '@prisma/client'
import { canSessionAccessBrandProject } from './brandAccess'
import { prisma } from './prisma'
import { pinVideoEditor, editorForLibrary } from './videoLineage'
import { requireActorPermission } from './role-permissions/delegation'
import { canUserAccessBrand } from './user-management/brandAccess'
import { verifyVideoReceipt, videoReceiptDigest } from './videoReceipt'

export type VideoJobActor = { id: string; type: string; role?: string }

const failure = (message: string, status: number) => Object.assign(new Error(message), { status })

/** Shared public/internal write boundary. Every caller receives the same lock, owner and lineage guarantees. */
export async function saveVideoJob(actor: VideoJobActor, body: any) {
  const id = text(body?.id)
  const brandId = text(body?.brandId)
  if (!id) throw failure('id is required', 400)
  if (!brandId) throw failure('brandId is required', 400)
  if (!await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)) throw failure('Not found', 404)

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (!await canUserAccessBrand(brandId, actor.id, 'WRITE')) throw failure('Not found', 404)
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'video-job:' + id}))::text`
    const existing = await tx.videoProductionJob.findUnique({
      where: { id },
      select: { id: true, brandId: true, createdBy: true, historyDeletedAt: true, plan: true, creativeId: true, idea: true, assetIds: true, mediaUrls: true },
    })
    if (existing && (existing.historyDeletedAt || existing.brandId !== brandId || !existing.createdBy || existing.createdBy !== actor.id)) throw failure('Not found', 404)
    await requireActorPermission(actor.id, 'content.video-making.create', brandId)

    const oldEditor = (existing?.plan as any)?._mmVideoJob?.editor
    const metadata = body.plan?._mmVideoJob || {}
    const oldMetadata = (existing?.plan as any)?._mmVideoJob || {}
    const projectId = text(body.plan?.basicVideoProjectId) || text(metadata.basicVideoProjectId)
    const oldProjectId = text((existing?.plan as any)?.basicVideoProjectId) || text(oldMetadata.basicVideoProjectId)
    if (oldProjectId && projectId !== oldProjectId) throw failure('video_project_immutable', 409)
    if (projectId) {
      const legacy = metadata.videoReceipt?.editorDigest === videoReceiptDigest(null)
      verifyVideoReceipt({ receipt: metadata.videoReceipt, projectId, brandId, ownerId: actor.id, editor: legacy ? null : metadata.editor,
        revisions: metadata.revisions || [], revisionsHasMore: Boolean(metadata.revisionsHasMore), existing: oldMetadata.videoReceipt })
      if (legacy && metadata.editor?.creativeRevisionId) throw failure('video_lineage_unverified', 409)
      metadata.basicVideoProjectId = projectId
      metadata.revisionsCursor = metadata.videoReceipt.historyCursor || null
      body.plan = { ...body.plan, basicVideoProjectId: projectId, _mmVideoJob: metadata }
    } else {
      metadata.revisions = []
      metadata.revisionsHasMore = false
      metadata.revisionsCursor = null
      delete metadata.videoReceipt
      body.plan = { ...body.plan, _mmVideoJob: metadata }
    }
    if (!metadata.editor && body.creativeId && !existing) throw failure('video_lineage_required', 409)
    if (existing && (existing.creativeId || null) !== (body.creativeId || null)) throw failure('video_lineage_immutable', 409)
    if (metadata.editor) {
      const original = existing || (!metadata.editor.creativeRevisionId && metadata.editor.originVideoJobId
        ? await tx.videoProductionJob.findUnique({ where: { id: metadata.editor.originVideoJobId } }) : null)
      if (original && (original.historyDeletedAt || original.brandId !== brandId || original.createdBy !== actor.id)) throw failure('video_lineage_not_found', 404)
      const originalEditor = (original?.plan as any)?._mmVideoJob?.editor
      const legacyExisting = original?.creativeId && !originalEditor?.creativeRevisionId && !metadata.editor.creativeRevisionId
        ? editorForLibrary(original, await tx.mediaAsset.findMany({ where: { brandId, id: { in: original.assetIds || [] } },
          select: { id: true, url: true, mimeType: true, aiCaption: true } })) : null
      if (legacyExisting && !originalEditor?.assets) legacyExisting.assets = (original!.assetIds || []).flatMap((assetId: string) => legacyExisting.assets.filter((asset: any) => asset.id === assetId))
      metadata.editor = await pinVideoEditor(tx, brandId, metadata.editor, legacyExisting || oldEditor)
      if (!oldEditor) {
        const ids = metadata.editor.assets.map((asset: any) => asset.id)
        if (ids.some((assetId: any) => typeof assetId !== 'string') || new Set(ids).size !== ids.length) throw failure('invalid_video_assets', 400)
        const trusted = await tx.mediaAsset.findMany({ where: { brandId, id: { in: ids } }, select: { id: true, url: true, mimeType: true, aiCaption: true } })
        if (trusted.length !== ids.length) throw failure('video_asset_not_found', 404)
        if (!projectId) metadata.editor.assets = ids.map((assetId: string) => trusted.find(asset => asset.id === assetId))
      }
      if (metadata.editor.creativeId !== (body.creativeId || null)) throw failure('video_lineage_immutable', 409)
      if (projectId && metadata.videoReceipt.editorDigest !== videoReceiptDigest(null)) verifyVideoReceipt({ receipt: metadata.videoReceipt, projectId,
        brandId, ownerId: actor.id, editor: metadata.editor, revisions: metadata.revisions || [], revisionsHasMore: Boolean(metadata.revisionsHasMore), existing: oldMetadata.videoReceipt })
      body.assetIds = metadata.editor.assets.map((asset: any) => asset.id)
      body.mediaUrls = metadata.editor.assets.map((asset: any) => asset.url)
      body.plan = { ...body.plan, _mmVideoJob: metadata }
    } else if (oldEditor) throw failure('video_lineage_required', 409)

    const create = { id, brandId, ...mutableVideoJob(body), createdBy: actor.id }
    const update = mutableVideoJob(body)
    return existing
      ? tx.videoProductionJob.update({ where: { id }, data: update })
      : tx.videoProductionJob.create({ data: create })
  })
}

function mutableVideoJob(body: any) {
  return {
    creativeId: optionalText(body.creativeId),
    title: text(body.title) || '短视频制作',
    platform: text(body.platform) || 'tiktok',
    idea: text(body.idea) || '根据所选素材制作一条适合发布的短视频。',
    status: text(body.status) || 'generating',
    progress: numberValue(body.progress) ?? 0,
    thumbnailUrl: optionalText(body.thumbnailUrl),
    finalVideoUrl: optionalText(body.finalVideoUrl),
    narration: optionalText(body.narration),
    musicBrief: optionalText(body.musicBrief),
    creatorType: optionalText(body.creatorType),
    aspectRatio: optionalText(body.aspectRatio),
    assetIds: stringArray(body.assetIds),
    mediaUrls: stringArray(body.mediaUrls),
    scenes: jsonValue(body.scenes, []),
    plan: jsonOrNull(body.plan),
    sceneExecutions: jsonOrNull(body.sceneExecutions),
    finalExecution: jsonOrNull(body.finalExecution),
    voiceoverState: voiceoverState(body),
    error: optionalText(body.error),
  }
}

const jsonOrNull = (value: unknown) => value && typeof value === 'object' ? value as any : null
const jsonValue = (value: unknown, fallback: unknown) => value && typeof value === 'object' ? value as any : fallback as any
const optionalText = (value: unknown) => text(value) || null
const stringArray = (value: unknown) => Array.isArray(value) ? value.map(text).filter(Boolean) : []
const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value))
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined
  }
  return undefined
}
function voiceoverState(body: any) {
  const fields = ['voiceSelection', 'voiceTaskId', 'awaitingVoiceover', 'voiceoverRequired', 'voiceoverVoiceId', 'brandVoiceProfileId', 'brandVoiceLabel', 'musicUrl', 'selectedMusicPrompt', 'script']
  return Object.fromEntries(fields.filter(key => body[key] !== undefined).map(key => [key, body[key]]))
}
