import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/asset-analysis/db'
import { canSessionAccessBrandProject, canSessionWriteBrandProject } from '@/lib/brandAccess'
import { ensureAssetFolders } from '@/lib/asset-analysis/folders'
import { createFolder, editFolder, removeFolder, presentFolders, presentRoots } from '@/lib/asset-library/folder-management'

type Params = { params: Promise<{ id: string }> }
async function actorFor(request: Request, brandId: string, write = false) {
  const key = extractApiKey(request)
  const session = await getSession()
  const user = key ? await getAgentFromApiKey(key) : session?.user
  if (!user) throw Object.assign(new Error('Unauthorized'), { status: 401 })
  const type = user.type || 'HUMAN'
  if (!await canSessionAccessBrandProject(brandId, user.id, type, user.role)) throw Object.assign(new Error('Brand not found'), { status: 404 })
  const canWrite = await canSessionWriteBrandProject(brandId, user.id, type)
  if (write && !canWrite) throw Object.assign(new Error('没有该品牌的素材编辑权限'), { status: 403 })
  return { id: user.id, type, canWrite }
}
function failure(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string }
  const status = e.status || (['P2002', 'P2034'].includes(e.code || '') ? 409 : 500)
  return NextResponse.json({ error: status === 500 ? '目录操作失败，请重试' : e.code === 'P2002' ? '目录名已存在' : e.code === 'P2034' ? '目录已发生变化，请刷新重试' : e.message }, { status })
}
export async function GET(request: Request, { params }: Params) {
  try {
    const { id } = await params; const actor = await actorFor(request, id)
    await ensureAssetFolders(id)
    return NextResponse.json({ roots: presentRoots(actor.canWrite), folders: await presentFolders(prisma, id, actor.canWrite), canCreate: actor.canWrite }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (e) { return failure(e) }
}
export async function POST(request: Request, { params }: Params) {
  try {
    const { id } = await params; const actor = await actorFor(request, id, true)
    await ensureAssetFolders(id)
    return NextResponse.json({ folder: await createFolder(prisma, id, actor, await request.json()) }, { status: 201 })
  } catch (e) { return failure(e) }
}
export async function PATCH(request: Request, { params }: Params) {
  try {
    const { id } = await params; const actor = await actorFor(request, id, true)
    return NextResponse.json({ folder: await editFolder(prisma, id, actor, await request.json()) })
  } catch (e) { return failure(e) }
}
export async function DELETE(request: Request, { params }: Params) {
  try {
    const { id } = await params; const actor = await actorFor(request, id, true); const url = new URL(request.url)
    await removeFolder(prisma, id, actor, { folderId: url.searchParams.get('folderId'), name: url.searchParams.get('name'), revision: url.searchParams.has('revision') ? Number(url.searchParams.get('revision')) : undefined })
    return NextResponse.json({ success: true })
  } catch (e) { return failure(e) }
}
