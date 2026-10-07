import { createHash, randomUUID } from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { ensureAssetFolders } from '@/lib/asset-analysis/folders'
import { canonicalFolderForAnalysis, templateForIndustry } from './templates'

type MigrationMove = { assetId: string; updatedAt: string; fromFolderId: string | null; fromCategory: string | null; toFolderId: string; toCategory: string; toSystemKey: string }
type FolderRow = { id: string; name: string; parentId: string | null; systemKey: string | null; folderKind: string }
const LEGACY_AI_FOLDERS = new Set(['菜品', '门店环境', '人物', '活动与宴席', '菜单与价格', '视频原片', '待确认', '重复素材', '不建议使用', '封面图', 'AI视频'])
export type AssetLibraryMigrationPreview = { brandId: string; digest: string; total: number; moves: MigrationMove[]; preservedCustom: number; alreadyStandard: number }

async function build(brandId: string): Promise<AssetLibraryMigrationPreview> {
  await ensureAssetFolders(brandId)
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id: brandId }, select: { industry: true } })
  const template = templateForIndustry(brand.industry)
  const [folders, assets] = await Promise.all([
    prisma.brandFolder.findMany({ where: { brandId } }),
    prisma.mediaAsset.findMany({ where: { brandId }, select: { id: true, folderId: true, aiCategory: true, mimeType: true, updatedAt: true, subjects: true, captureType: true, quality: true, textDetection: true, imageAnalysis: true, manualOverrides: true } }),
  ])
  const folderRows = folders as FolderRow[]
  const standard = new Map<string, FolderRow>(folderRows.filter((folder: FolderRow) => folder.folderKind === 'STANDARD' && folder.systemKey).map((folder: FolderRow) => [folder.systemKey!, folder]))
  let preservedCustom = 0, alreadyStandard = 0
  const moves: MigrationMove[] = []
  for (const asset of assets) {
    const current = folderRows.find((folder: FolderRow) => folder.id === asset.folderId)
    if (current?.folderKind === 'STANDARD') { alreadyStandard++; continue }
    const manualOverride = asset.manualOverrides && typeof asset.manualOverrides === 'object' && (asset.manualOverrides as any).folderEdited
    const ambiguousCustom = current
      ? !current.parentId && !LEGACY_AI_FOLDERS.has(current.name)
      : !!asset.aiCategory && !['raw', '素材库', ...LEGACY_AI_FOLDERS].includes(asset.aiCategory)
    if (manualOverride || ambiguousCustom) { preservedCustom++; continue }
    const analyzed = asset.imageAnalysis && typeof asset.imageAnalysis === 'object' ? asset.imageAnalysis as any : {}
    const key = canonicalFolderForAnalysis(template, { ...analyzed, subjects: asset.subjects || analyzed.subjects, captureType: asset.captureType || analyzed.captureType, quality: asset.quality || analyzed.quality, textDetection: asset.textDetection || analyzed.textDetection }, asset.mimeType)
    const target = standard.get(key)
    if (!target) throw new Error(`Standard folder missing: ${key}`)
    if (asset.folderId === target.id && asset.aiCategory === target.name) { alreadyStandard++; continue }
    moves.push({ assetId: asset.id, updatedAt: asset.updatedAt.toISOString(), fromFolderId: asset.folderId, fromCategory: asset.aiCategory, toFolderId: target.id, toCategory: target.name, toSystemKey: key })
  }
  const digest = createHash('sha256').update(JSON.stringify(moves)).digest('hex')
  return { brandId, digest, total: assets.length, moves, preservedCustom, alreadyStandard }
}

export const previewAssetLibraryMigration = build
export async function applyAssetLibraryMigration(brandId: string, expectedDigest: string, actorId?: string) {
  const preview = await build(brandId)
  if (!expectedDigest || preview.digest !== expectedDigest) throw Object.assign(new Error('Migration preview changed; preview again'), { status: 409 })
  const migrationId = randomUUID()
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const move of preview.moves) {
      const updated = await tx.mediaAsset.updateMany({ where: { id: move.assetId, brandId, updatedAt: new Date(move.updatedAt) }, data: { folderId: move.toFolderId, aiCategory: move.toCategory } })
      if (!updated.count) throw Object.assign(new Error('Asset changed; preview again'), { status: 409 })
      await tx.auditLog.create({ data: { actorId, action: 'ASSET_LIBRARY_MIGRATION_MOVE', resourceType: 'MediaAsset', resourceId: move.assetId, oldValue: { folderId: move.fromFolderId, aiCategory: move.fromCategory }, newValue: { folderId: move.toFolderId, aiCategory: move.toCategory }, reason: migrationId, metadata: { brandId, digest: preview.digest } } })
    }
  }, { isolationLevel: 'Serializable', timeout: 60_000 })
  return { migrationId, moved: preview.moves.length, digest: preview.digest }
}
export async function rollbackAssetLibraryMigration(brandId: string, migrationId: string, actorId?: string) {
  const logs = await prisma.auditLog.findMany({ where: { action: 'ASSET_LIBRARY_MIGRATION_MOVE', reason: migrationId, metadata: { path: ['brandId'], equals: brandId } }, orderBy: { timestamp: 'desc' } })
  if (!logs.length) throw Object.assign(new Error('Migration not found'), { status: 404 })
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const log of logs) { const old = log.oldValue as any; await tx.mediaAsset.updateMany({ where: { id: log.resourceId, brandId }, data: { folderId: old?.folderId || null, aiCategory: old?.aiCategory || null } }) }
    await tx.auditLog.create({ data: { actorId, action: 'ASSET_LIBRARY_MIGRATION_ROLLED_BACK', resourceType: 'Brand', resourceId: brandId, reason: migrationId, metadata: { brandId, restored: logs.length } } })
  })
  return { migrationId, restored: logs.length }
}
