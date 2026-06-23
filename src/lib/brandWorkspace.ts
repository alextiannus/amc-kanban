import { prisma } from '@/lib/prisma'
import { ensureHuaweiObsBrandWorkspace } from '@/lib/integrations/huaweiObs'

export async function ensureBrandWorkspace(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      larkDriveFolderId: true,
    },
  })

  if (!brand) return { ok: false as const, skipped: true as const, reason: 'brand_not_found' as const }
  const obsWorkspace = await ensureHuaweiObsBrandWorkspace({ brandId: brand.id, brandName: brand.name })

  return {
    ok: obsWorkspace.ok,
    skipped: true as const,
    folderToken: brand.larkDriveFolderId || null,
    folderUrl: brand.larkDriveFolderId ? `https://open.feishu.cn/drive/folder/${brand.larkDriveFolderId}` : null,
    obsWorkspace,
  }
}

