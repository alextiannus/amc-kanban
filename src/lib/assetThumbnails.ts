import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from './prisma'
import { getHuaweiObsConfig, getHuaweiObsPresignedPutUrl } from './integrations/huaweiObs'

// Queue state lives alongside technical metadata, avoiding a destructive migration.
// Only the authenticated Content service can claim/finish work; list callers never
// receive the lease token or the upload URL.
export async function thumbnailWorkerAction(body: any, readable: (asset: any) => string) {
  if (body.action === 'thumbnailClaim') {
    if (!getHuaweiObsConfig()) return { job: null }
    await prisma.$executeRaw`
      UPDATE "MediaAsset" SET "technicalMetadata" = jsonb_set("technicalMetadata", '{thumbnail,status}', '"failed"'::jsonb)
      WHERE "technicalMetadata"->'thumbnail'->>'status' = 'processing'
        AND ("technicalMetadata"->'thumbnail'->>'leaseUntil')::timestamptz < now()
        AND COALESCE(("technicalMetadata"->'thumbnail'->>'attempts')::int, 0) >= 3
    `
    const token = randomUUID()
    const rows = await prisma.$queryRaw<any[]>`
      WITH candidate AS (
        SELECT id FROM "MediaAsset"
        WHERE ("mimeType" LIKE 'image/%' OR "mimeType" LIKE 'video/%')
          AND (
            COALESCE("technicalMetadata"->'thumbnail'->>'revision', '') <>
              md5(url || ':' || COALESCE("sizeBytes"::text, '') || ':' || "mimeType")
            OR "technicalMetadata"->'thumbnail'->>'status' = 'pending'
            OR ("technicalMetadata"->'thumbnail'->>'status' = 'processing'
              AND ("technicalMetadata"->'thumbnail'->>'leaseUntil')::timestamptz < now())
            OR ("technicalMetadata"->'thumbnail'->>'status' = 'failed'
              AND COALESCE(("technicalMetadata"->'thumbnail'->>'attempts')::int, 0) < 3
              AND ("technicalMetadata"->'thumbnail'->>'retryAt')::timestamptz <= now())
          )
        ORDER BY CASE WHEN ("technicalMetadata"->'thumbnailPriority'->>'until')::timestamptz > now() THEN 0 ELSE 1 END,
          "createdAt" DESC, id DESC LIMIT 1 FOR UPDATE SKIP LOCKED
      )
      UPDATE "MediaAsset" a SET "technicalMetadata" =
        COALESCE(a."technicalMetadata", '{}'::jsonb) || jsonb_build_object('thumbnail',
          jsonb_build_object('status', 'processing', 'revision',
            md5(a.url || ':' || COALESCE(a."sizeBytes"::text, '') || ':' || a."mimeType"),
            'attempts', CASE WHEN a."technicalMetadata"->'thumbnail'->>'revision' =
              md5(a.url || ':' || COALESCE(a."sizeBytes"::text, '') || ':' || a."mimeType")
              THEN COALESCE((a."technicalMetadata"->'thumbnail'->>'attempts')::int, 0) + 1 ELSE 1 END,
            'token', ${token}::text, 'leaseUntil', now() + interval '4 minutes'))
      FROM candidate WHERE a.id = candidate.id RETURNING a.*
    `
    const asset = rows[0]
    if (!asset) return { job: null }
    const revision = asset.technicalMetadata.thumbnail.revision
    // A token-specific object prevents an expired worker overwriting a newer one.
    const key = `brands/${asset.brandId}/assets/thumbnails/${asset.id}/${revision}-${token}.webp`
    const upload = getHuaweiObsPresignedPutUrl({ key, contentType: 'image/webp' })
    if (!upload) {
      await finishThumbnail({ assetId: asset.id, token, error: 'OBS unavailable' })
      return { job: null }
    }
    await prisma.$executeRaw`
      UPDATE "MediaAsset" SET "technicalMetadata" = jsonb_set("technicalMetadata", '{thumbnail}',
        ("technicalMetadata"->'thumbnail') || ${JSON.stringify({ key, url: upload.publicUrl })}::jsonb)
      WHERE id = ${asset.id} AND "technicalMetadata"->'thumbnail'->>'token' = ${token}
    `
    return { job: { assetId: asset.id, brandId: asset.brandId, token, revision,
      sourceUrl: readable(asset), mimeType: asset.mimeType, uploadUrl: upload.uploadUrl,
      headers: upload.headers } }
  }
  if (body.action === 'thumbnailFinish') return finishThumbnail(body)
  throw new Error('Unsupported thumbnail action')
}

async function finishThumbnail(body: any) {
  if (typeof body.assetId !== 'string' || typeof body.token !== 'string') throw new Error('Missing thumbnail lease')
  const failed = typeof body.error === 'string' && body.error.length > 0
  const allowedCodes = ['SOURCE_UNAVAILABLE','SOURCE_ACCESS_DENIED','SOURCE_TOO_LARGE','SOURCE_URL_REJECTED','MEDIA_PROCESSOR_UNAVAILABLE','MEDIA_DECODE_FAILED','UPLOAD_FAILED','PROCESSING_FAILED']
  const patch = { status: failed ? 'failed' : 'ready', error: failed ? body.error.slice(0, 160) : null,
    errorCode: failed && allowedCodes.includes(body.errorCode) ? body.errorCode : failed ? 'PROCESSING_FAILED' : null }
  const count = await prisma.$executeRaw`
    UPDATE "MediaAsset" SET "technicalMetadata" = jsonb_set("technicalMetadata", '{thumbnail}',
      (("technicalMetadata"->'thumbnail') - 'token' - 'leaseUntil') || ${JSON.stringify(patch)}::jsonb
        || jsonb_build_object('retryAt', now() + interval '5 minutes'))
    WHERE id = ${body.assetId} AND "technicalMetadata"->'thumbnail'->>'token' = ${body.token}
      AND ("technicalMetadata"->'thumbnail'->>'leaseUntil')::timestamptz > now()
      AND "technicalMetadata"->'thumbnail'->>'revision' =
        md5(url || ':' || COALESCE("sizeBytes"::text, '') || ':' || "mimeType")
  `
  return { ok: count === 1 }
}

export function publicThumbnail(asset: any) {
  const t = asset.technicalMetadata?.thumbnail
  const revision = createHash('md5').update(`${asset.url}:${asset.sizeBytes ?? ''}:${asset.mimeType}`).digest('hex')
  if (t?.revision !== revision) return { thumbnailStatus: 'pending', thumbnailRetryable: false }
  let status = ['pending','processing','ready','failed'].includes(t?.status) ? t.status : 'pending'
  if (status === 'failed' && (t.attempts || 0) < 3) status = 'retrying'
  if (status === 'processing' && new Date(t.leaseUntil).getTime() <= Date.now()) status = (t.attempts || 0) < 3 ? 'retrying' : 'failed'
  if (status === 'ready' && !t.url) status = 'failed'
  // Keep the original metadata private. A pending thumbnail is always a placeholder.
  return { thumbnailUrl: status === 'ready' ? t.url : undefined,
    thumbnailStatus: status, thumbnailRetryable: status === 'failed' }
}

// Brand authorization happens in the route before entering this transaction.
// Validate the complete ID set under locks before updating anything.
export async function prepareAssetThumbnails(brandId: string, input: unknown, retry: unknown = false) {
  const invalid = (message: string, status = 422) => Object.assign(new Error(message), { status })
  if (!Array.isArray(input) || !input.length || input.length > 60 || input.some(id => typeof id !== 'string' || !id.trim()) || typeof retry !== 'boolean') {
    throw invalid('assetIds must contain 1-60 material IDs and retry must be a boolean')
  }
  if (!getHuaweiObsConfig()) throw invalid('Thumbnail preparation is unavailable',503)
  const ids = JSON.stringify([...new Set(input.map(id => id.trim()))])
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const assets = await tx.$queryRaw<any[]>`
      SELECT * FROM "MediaAsset" WHERE "brandId" = ${brandId}
        AND id IN (SELECT jsonb_array_elements_text(${ids}::jsonb))
        AND ("mimeType" LIKE 'image/%' OR "mimeType" LIKE 'video/%')
      ORDER BY id FOR UPDATE
    `
    if (assets.length !== JSON.parse(ids).length) throw invalid('Materials not found',404)
    // Preserve metadata and active jobs; priority is a separate sibling of thumbnail.
    const changed = await tx.$executeRaw`
      UPDATE "MediaAsset" SET "technicalMetadata" =
        COALESCE("technicalMetadata", '{}'::jsonb)
        || jsonb_build_object('thumbnailPriority', jsonb_build_object('until', now() + interval '10 minutes'))
        || CASE WHEN ${retry}::boolean AND (
            ("technicalMetadata"->'thumbnail'->>'status' = 'failed' AND
              COALESCE(("technicalMetadata"->'thumbnail'->>'attempts')::int,0) >= 3)
            OR ("technicalMetadata"->'thumbnail'->>'status' = 'processing'
              AND ("technicalMetadata"->'thumbnail'->>'leaseUntil')::timestamptz <= now()
              AND COALESCE(("technicalMetadata"->'thumbnail'->>'attempts')::int,0) >= 3)
            OR ("technicalMetadata"->'thumbnail'->>'status' = 'ready' AND "technicalMetadata"->'thumbnail'->>'url' IS NULL)
          ) THEN jsonb_build_object('thumbnail', jsonb_build_object('status','pending','attempts',0,'revision',
            md5(url || ':' || COALESCE("sizeBytes"::text,'') || ':' || "mimeType"))) ELSE '{}'::jsonb END
      WHERE "brandId" = ${brandId} AND id IN (SELECT jsonb_array_elements_text(${ids}::jsonb))
        AND NOT (COALESCE("technicalMetadata"->'thumbnail'->>'status','') = 'ready'
          AND COALESCE("technicalMetadata"->'thumbnail'->>'revision','') = md5(url || ':' || COALESCE("sizeBytes"::text,'') || ':' || "mimeType")
          AND "technicalMetadata"->'thumbnail'->>'url' IS NOT NULL)
        AND (${retry}::boolean OR COALESCE(("technicalMetadata"->'thumbnailPriority'->>'until')::timestamptz,now()) <= now())
    `
    const rows = await tx.$queryRaw<any[]>`SELECT * FROM "MediaAsset" WHERE "brandId" = ${brandId} AND id IN (SELECT jsonb_array_elements_text(${ids}::jsonb))`
    return { scheduled: changed, items: rows.map(asset => ({ id: asset.id, ...publicThumbnail(asset) })) }
  })
}
