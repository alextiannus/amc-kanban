import { resolve, sep } from 'node:path'
import { PrismaClient } from '@prisma/client'
import {
  inspectMediaFile,
  inspectMediaUrl,
  type MediaTechnicalMetadata,
} from '../src/lib/mediaValidation.ts'

const prisma = new PrismaClient()
const POSTFAST_MEDIA_BASE = 'https://postfast-media-prod.s3.ap-southeast-1.amazonaws.com/'
const args = process.argv.slice(2)
const apply = args.includes('--apply')
const dryRun = args.includes('--dry-run') || !apply
const brandFlag = args.findIndex((value) => value === '--brand' || value === '--brand-id')
const brandId = brandFlag >= 0 ? args[brandFlag + 1] : undefined

if (apply && args.includes('--dry-run')) {
  throw new Error('Choose either --dry-run or --apply, not both')
}
if (brandFlag >= 0 && !brandId) {
  throw new Error('--brand requires a brand ID')
}

function localPublicPath(url: string) {
  const publicRoot = resolve(process.cwd(), 'public')
  const target = resolve(publicRoot, `.${url.split('?')[0]}`)
  if (target !== publicRoot && !target.startsWith(`${publicRoot}${sep}`)) {
    throw new Error('Invalid local media path')
  }
  return target
}

function postfastUrl(storageKey: string) {
  return new URL(storageKey.replace(/^\/+/, ''), POSTFAST_MEDIA_BASE).toString()
}

async function inspectAsset(asset: {
  url: string
  filename: string
  mimeType: string
  sizeBytes: number | null
  sourceType: string
}) {
  if (asset.url.startsWith('http')) {
    return inspectMediaUrl(asset.url, asset)
  }
  if (asset.url.startsWith('/api/integrations/postfast/file/')) {
    const key = asset.url.split('?')[0].split('/').slice(6).join('/')
    return inspectMediaUrl(postfastUrl(key), asset)
  }
  if (asset.url.startsWith('/')) {
    return inspectMediaFile(localPublicPath(asset.url), asset)
  }
  if (asset.sourceType === 'postfast') {
    return inspectMediaUrl(postfastUrl(asset.url), asset)
  }
  throw new Error(`Unsupported historical source type: ${asset.sourceType || 'unknown'}`)
}

async function mapWithConcurrency<T>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<void>,
) {
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor
      cursor += 1
      await mapper(values[index])
    }
  }))
}

const assets = (await prisma.mediaAsset.findMany({
  where: brandId ? { brandId } : undefined,
  select: {
    id: true,
    brandId: true,
    url: true,
    filename: true,
    mimeType: true,
    sizeBytes: true,
    sourceType: true,
    technicalMetadata: true,
  },
  orderBy: { createdAt: 'asc' },
})).filter((asset) => !asset.technicalMetadata)

let inspected = 0
let updated = 0
let failed = 0

console.info('[media-backfill] start', {
  mode: dryRun ? 'dry-run' : 'apply',
  brandId: brandId || 'all',
  candidates: assets.length,
  concurrency: 3,
})

await mapWithConcurrency(assets, 3, async (asset) => {
  try {
    const metadata: MediaTechnicalMetadata = await inspectAsset(asset)
    inspected += 1
    if (apply) {
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: {
          mimeType: metadata.mimeType,
          sizeBytes: metadata.sizeBytes,
          width: metadata.width ?? null,
          height: metadata.height ?? null,
          technicalMetadata: metadata,
        },
      })
      updated += 1
    }
    console.info('[media-backfill] inspected', {
      assetId: asset.id,
      source: asset.sourceType,
      kind: metadata.kind,
      applied: apply,
    })
  } catch (error) {
    failed += 1
    console.warn('[media-backfill] failed', {
      assetId: asset.id,
      source: asset.sourceType,
      error: error instanceof Error ? error.message : String(error),
    })
  }
})

console.info('[media-backfill] complete', {
  mode: dryRun ? 'dry-run' : 'apply',
  candidates: assets.length,
  inspected,
  updated,
  failed,
})

await prisma.$disconnect()
if (failed > 0) process.exitCode = 2
