import { prisma } from '@/lib/asset-analysis/db'
import { INITIAL_FOLDERS } from './policy'

export async function ensureAssetFolders(brandId: string) {
  await prisma.$transaction(async tx => {
    const claimed = await tx.brand.updateMany({ where: { id: brandId, assetFoldersInitialized: false }, data: { assetFoldersInitialized: true } })
    if (claimed.count) await tx.brandFolder.createMany({ data: INITIAL_FOLDERS.map(name => ({ brandId, name })), skipDuplicates: true })
    // Adopt existing directory names created through upload / MCP without moving any assets.
    const categories = await tx.mediaAsset.findMany({ where: { brandId, aiCategory: { not: null } }, distinct: ['aiCategory'], select: { aiCategory: true } })
    const names = categories.map(a => a.aiCategory!).filter(name => !['raw', '素材库', 'all', '已使用'].includes(name))
    if (names.length) await tx.brandFolder.createMany({ data: names.map(name => ({ brandId, name })), skipDuplicates: true })
  })
}
