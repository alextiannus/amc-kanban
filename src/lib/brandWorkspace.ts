import { prisma } from '@/lib/prisma'
import { createBrandWorkspace } from '@/lib/integrations/lark'
import { ensureHuaweiObsBrandWorkspace } from '@/lib/integrations/huaweiObs'

export async function ensureBrandWorkspace(brandId: string) {
  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      larkAppId: true,
      larkAppSecret: true,
      larkParentFolderToken: true,
      larkDriveFolderId: true,
    },
  })

  if (!brand) return { ok: false as const, skipped: true as const, reason: 'brand_not_found' as const }
  const obsWorkspace = await ensureHuaweiObsBrandWorkspace({ brandId: brand.id, brandName: brand.name })

  if (brand.larkDriveFolderId) {
    return { ok: true as const, skipped: true as const, folderToken: brand.larkDriveFolderId, obsWorkspace }
  }
  if (!brand.larkAppId || !brand.larkAppSecret) {
    return { ok: obsWorkspace.ok, skipped: true as const, reason: 'lark_not_configured' as const, obsWorkspace }
  }

  const result = await createBrandWorkspace({
    appId: brand.larkAppId,
    appSecret: brand.larkAppSecret,
    parentFolderToken: brand.larkParentFolderToken || undefined,
    brandName: brand.name,
  })

  if (!result.success || !result.folderToken) {
    return { ok: obsWorkspace.ok, skipped: false as const, reason: result.error || 'workspace_create_failed', obsWorkspace }
  }

  await prisma.brand.update({
    where: { id: brand.id },
    data: { larkDriveFolderId: result.folderToken },
  })

  return { ok: true as const, skipped: false as const, folderToken: result.folderToken, folderUrl: result.folderUrl, obsWorkspace }
}
