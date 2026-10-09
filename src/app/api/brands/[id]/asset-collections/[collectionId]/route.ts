import { analysisActor } from '@/lib/asset-analysis/auth'
import { deleteAssetCollection, getAssetCollection } from '@/lib/asset-library/collections'
type Context = { params: Promise<{ id: string; collectionId: string }> }
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
export async function GET(request: Request, context: Context) { try { const { id, collectionId } = await context.params; await analysisActor(request, id); return json({ collection: await getAssetCollection(id, collectionId) }) } catch (error: any) { return json({ error: error?.message || 'Unable to load asset collection' }, error?.status || 500) } }
export async function DELETE(request: Request, context: Context) { try { const { id, collectionId } = await context.params; await analysisActor(request, id); return json(await deleteAssetCollection(id, collectionId)) } catch (error: any) { return json({ error: error?.message || 'Unable to delete asset collection' }, error?.status || 500) } }
