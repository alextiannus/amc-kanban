import { prisma } from '@/lib/asset-analysis/db'
import { templateForIndustry } from '@/lib/asset-library/templates'

export async function ensureAssetFolders(brandId: string) {
  await prisma.$transaction(async tx => {
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: { industry: true } })
    const template = templateForIndustry(brand.industry)
    for (const folder of template.folders) {
      const existingByName = await tx.brandFolder.findUnique({ where: { brandId_name: { brandId, name: folder.zh } } })
      if (existingByName) await tx.brandFolder.update({ where: { id: existingByName.id }, data: { systemKey: folder.key, folderKind: 'STANDARD', templateVersion: template.key } })
      else await tx.brandFolder.upsert({ where: { brandId_systemKey: { brandId, systemKey: folder.key } }, create: { brandId, name: folder.zh, systemKey: folder.key, folderKind: 'STANDARD', templateVersion: template.key }, update: { folderKind: 'STANDARD', templateVersion: template.key } })
    }
    await tx.brand.update({ where: { id: brandId }, data: { assetFoldersInitialized: true } })
  })
}
