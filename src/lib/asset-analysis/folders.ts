import { prisma } from '@/lib/asset-analysis/db'
import { templateForIndustry } from '../asset-library/templates.ts'

export async function ensureAssetFolders(brandId: string) {
  await prisma.$transaction(async tx => {
    const brand = await tx.brand.findUniqueOrThrow({ where: { id: brandId }, select: { industry: true } })
    const template = templateForIndustry(brand.industry)
    for (const folder of template.folders) {
      const existing = await tx.brandFolder.findFirst({
        where: { brandId, OR: [{ systemKey: folder.key }, { name: folder.zh }] },
      })
      if (existing) {
        await tx.brandFolder.update({
          where: { id: existing.id },
          data: { systemKey: folder.key, folderKind: 'STANDARD', templateVersion: template.key },
        })
      } else {
        await tx.brandFolder.create({
          data: { brandId, name: folder.zh, systemKey: folder.key, folderKind: 'STANDARD', templateVersion: template.key },
        })
      }
    }
    await tx.brand.update({ where: { id: brandId }, data: { assetFoldersInitialized: true } })
  })
}
