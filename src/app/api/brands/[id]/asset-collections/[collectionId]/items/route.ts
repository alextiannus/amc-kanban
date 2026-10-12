import { analysisActor } from '@/lib/asset-analysis/auth'
import { linkAssetToCollection, unlinkAssetFromCollection } from '@/lib/asset-library/collections'

type Context = { params: Promise<{ id: string; collectionId: string }> }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(request: Request, context: Context) {
  try {
    const { id: brandId, collectionId } = await context.params
    await analysisActor(request, brandId)
    const body = await request.json()
    if (!body || typeof body.assetId !== 'string') return json({ error: 'assetId is required' }, 400)
    const item = await linkAssetToCollection({
      brandId,
      collectionId,
      assetId: body.assetId,
      slotId: typeof body.slotId === 'string' ? body.slotId : undefined,
      role: typeof body.role === 'string' ? body.role : undefined,
      order: Number.isInteger(body.order) ? body.order : 0,
      uploadOrigin: body.uploadOrigin === 'UPLOAD' || body.uploadOrigin === 'MIGRATION' ? body.uploadOrigin : 'LIBRARY',
    })
    return json({ item }, 201)
  } catch (error: any) {
    return json({ error: error?.message || 'Unable to link asset' }, error?.status || 500)
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const { id: brandId, collectionId } = await context.params
    await analysisActor(request, brandId)
    const assetId = new URL(request.url).searchParams.get('assetId')
    if (!assetId) return json({ error: 'assetId is required' }, 400)
    return json(await unlinkAssetFromCollection({ brandId, collectionId, assetId }))
  } catch (error: any) {
    return json({ error: error?.message || 'Unable to unlink asset' }, error?.status || 500)
  }
}
