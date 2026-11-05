import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import { updateAssetFiling, filingError } from '@/lib/asset-library/filing'
import { rollbackOrganization } from '@/lib/asset-library/organize'
import { rollbackCoverBackfill } from '@/lib/asset-library/cover-history'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = (await getSession())?.user
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params, type = user.type || 'HUMAN'
  if (!await canSessionAccessBrandProject(id, user.id, type, user.role)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!await canSessionWriteBrandProject(id, user.id, type)) return NextResponse.json({ error: '没有该品牌的素材编辑权限' }, { status: 403 })
  try {
    const body = await request.json(), actor = { id: user.id, type }
    if (body.action === 'rollback' && typeof body.receiptId === 'string') return NextResponse.json(await rollbackOrganization(prisma, id, actor, body.receiptId))
    if (body.action === 'rollback-cover' && typeof body.receiptId === 'string') return NextResponse.json(await rollbackCoverBackfill(prisma, id, body.receiptId, actor))
    if (body.action === 'cover') {
      if (!body.revisions || typeof body.revisions !== 'object' || Array.isArray(body.revisions) || body.confirmCoverPurpose !== true) return NextResponse.json({ error: '请先预览并确认设为封面素材' }, { status: 400 })
      const receipt: { id?: string } = {}
      const assets = await updateAssetFiling(prisma, id, actor, body.assetIds, { isCoverMaterial: true, revisions: body.revisions }, receipt)
      return NextResponse.json({ updated: assets.length, receiptId: receipt.id, rollbackAction: 'rollback-cover' })
    }
    if (body.action !== 'apply' || !body.revisions || body.confirmMaterialClassChange !== true || !['ORIGINAL', 'AI', 'MANUAL'].includes(body.materialClass)) return NextResponse.json({ error: '请先预览并确认目标目录和素材类别' }, { status: 400 })
    const receipt: { id?: string } = {}
    const assets = await updateAssetFiling(prisma, id, actor, body.assetIds, { materialClass: body.materialClass, folderId: body.folderId || null, revisions: body.revisions, confirmMaterialClassChange: true }, receipt)
    return NextResponse.json({ updated: assets.length, receiptId: receipt.id })
  } catch (e) { const result = filingError(e); return NextResponse.json(result.body, { status: result.status }) }
}
