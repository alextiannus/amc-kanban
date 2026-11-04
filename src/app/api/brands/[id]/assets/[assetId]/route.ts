import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import { triggerDesignerAutoTag } from '@/lib/designer'
import { submitAssetToCalendarCreativeRequirement } from '@/lib/brand-plan/calendarSync'
import { ensureAssetFolders } from '@/lib/asset-analysis/folders'

import { updateAssetFiling, filingError } from '@/lib/asset-library/filing'

type Params = { params: Promise<{ id: string; assetId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: authenticatedAgent.role }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, assetId } = await params
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canSessionWriteBrandProject(brandId, actor.id, actor.type)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await request.json().catch(() => ({}))
  let asset
  try { [asset] = await updateAssetFiling(prisma, brandId, actor, [assetId], body) }
  catch (e) { const result = filingError(e); return NextResponse.json(result.body, { status: result.status }) }

  if (typeof body.creativeId === 'string' && body.creativeId.trim()) {
    await submitAssetToCalendarCreativeRequirement({
      brandId,
      assetId: asset.id,
      creativeId: body.creativeId,
      submittedBy: actor.id,
    })
  }

  // Trigger platform Designer auto-tagging in the background
  if (body.triggerAiTagging === true && (asset.mimeType.startsWith('image/') || asset.mimeType.startsWith('video/'))) {
    await triggerDesignerAutoTag(asset.id).catch((err) => {
      console.error('[Asset PATCH] Failed to auto-tag asset in background:', err)
    })
  }

  return NextResponse.json({ ok: true, asset })
}

export async function DELETE(request: Request, { params }: Params) {
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, assetId } = await params
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!await canSessionWriteBrandProject(brandId, actor.id, actor.type)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const asset = await prisma.mediaAsset.findFirst({
    where: { id: assetId, brandId },
    select: { id: true, url: true, sourceType: true }
  })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // If local storage, delete the local file on disk to save space
  if (asset.sourceType === 'local' && asset.url.startsWith('/uploads/')) {
    try {
      const { unlink } = await import('fs/promises')
      const path = await import('path')
      const absolutePath = path.join(process.cwd(), 'public', asset.url)
      await unlink(absolutePath)
    } catch (err) {
      console.error('[Assets] Failed to delete local file from disk:', err)
    }
  }

  await prisma.mediaAsset.delete({ where: { id: assetId } })
  return NextResponse.json({ ok: true })
}
