import { createHash, randomUUID } from 'node:crypto'
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
            OR ("technicalMetadata"->'thumbnail'->>'status' = 'processing'
              AND ("technicalMetadata"->'thumbnail'->>'leaseUntil')::timestamptz < now())
            OR ("technicalMetadata"->'thumbnail'->>'status' = 'failed'
              AND COALESCE(("technicalMetadata"->'thumbnail'->>'attempts')::int, 0) < 3
              AND ("technicalMetadata"->'thumbnail'->>'retryAt')::timestamptz <= now())
          )
        ORDER BY "createdAt" DESC, id DESC LIMIT 1 FOR UPDATE SKIP LOCKED
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
  const patch = { status: failed ? 'failed' : 'ready', error: failed ? body.error.slice(0, 160) : null }
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
  if (t?.revision !== revision) return { thumbnailStatus: 'pending' }
  // Keep the original metadata private. A pending thumbnail is always a placeholder.
  return { thumbnailUrl: t?.status === 'ready' ? t.url : undefined,
    thumbnailStatus: t?.status || 'pending' }
}
