import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/asset-analysis/db'
import { templateForIndustry } from '../asset-library/templates.ts'

export async function lockFolderSpace(tx: Prisma.TransactionClient, brandId: string) {
  await tx.$queryRaw`SELECT id FROM "Brand" WHERE id = ${brandId} FOR UPDATE`
}
export async function ensureFoldersInTransaction(tx: Prisma.TransactionClient, brandId: string) {
  await lockFolderSpace(tx, brandId)
  const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: { industry: true, processedFoldersInitialized: true } })
  const template = templateForIndustry(brand.industry)
  for (const folder of template.folders) {
    const keyed = await tx.brandFolder.findUnique({ where: { brandId_systemKey: { brandId, systemKey: folder.key } } })
    if (keyed) {
      if (keyed.materialClass !== 'ORIGINAL') await tx.brandFolder.update({ where: { id: keyed.id }, data: { materialClass: 'ORIGINAL', revision: { increment: 1 } } })
      continue
    }
    const legacy = await tx.brandFolder.findFirst({ where: { brandId, name: folder.zh, systemKey: null, parentId: null, materialClass: { in: ['UNCONFIRMED', 'ORIGINAL'] } } })
    if (legacy) {
      await tx.brandFolder.update({ where: { id: legacy.id }, data: { systemKey: folder.key, folderKind: 'STANDARD', materialClass: 'ORIGINAL', templateVersion: template.key, revision: { increment: 1 } } })
    } else {
      const collision = await tx.brandFolder.findUnique({ where: { brandId_name: { brandId, name: folder.zh } } })
      await tx.brandFolder.create({ data: { brandId, name: collision ? `${folder.zh} (${folder.key})` : folder.zh, systemKey: folder.key, folderKind: 'STANDARD', materialClass: 'ORIGINAL', templateVersion: template.key } })
    }
  }
  if (!brand.processedFoldersInitialized) for (const [systemKey, name, materialClass] of [['processed_manual', '人工剪辑', 'MANUAL'], ['processed_ai', 'AI 制作', 'AI']] as const) {
    if (await tx.brandFolder.findUnique({ where: { brandId_systemKey: { brandId, systemKey } } })) continue
    const collision = await tx.brandFolder.findUnique({ where: { brandId_name: { brandId, name } } })
    await tx.brandFolder.create({ data: { brandId, name: collision ? `${name} (${systemKey})` : name, systemKey, folderKind: 'CUSTOM', materialClass } })
  }
  await tx.brand.update({ where: { id: brandId }, data: { assetFoldersInitialized: true, processedFoldersInitialized: true } })
}
export async function ensureAssetFolders(brandId: string) {
  await prisma.$transaction(tx => ensureFoldersInTransaction(tx, brandId), { timeout: 30_000 })
}
