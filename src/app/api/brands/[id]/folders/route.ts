import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/asset-analysis/db'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

import { ensureAssetFolders } from '@/lib/asset-analysis/folders'
import { folderName as validateFolderName, PROTECTED_FOLDERS } from '@/lib/asset-analysis/policy'
const RESERVED_FOLDERS = new Set(PROTECTED_FOLDERS)

async function checkAuth(request: Request, brandId: string) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null

  if (!session?.user && !apiKey) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  if (apiKey && !authenticatedAgent) {
    return { ok: false, status: 401, error: 'Invalid API key' }
  }

  let user = session?.user
  if (apiKey && authenticatedAgent) {
    user = {
      id: authenticatedAgent.id,
      email: authenticatedAgent.email,
      type: authenticatedAgent.type,
      role: 'USER',
    }
  }

  if (!user) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }

  const ok = await canSessionAccessBrandProject(brandId, user.id, user.type ?? 'HUMAN', user.role)
  if (!ok) return { ok: false, status: 404, error: 'Brand not found' }

  return { ok: true, userId: user.id }
}

// GET /api/brands/[id]/folders
// List folders for a brand. Automatically seeds default folders if empty.
export async function GET(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const auth = await checkAuth(request, brandId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    await ensureAssetFolders(brandId)

    const folders = await prisma.brandFolder.findMany({
      where: { brandId },
      orderBy: { createdAt: 'asc' },
    })

    const counts = await prisma.mediaAsset.groupBy({ by: ['aiCategory'], where: { brandId }, _count: { _all: true } })
    return NextResponse.json({ folders: folders.map(folder => ({ ...folder, assetCount: counts.find(c => c.aiCategory === folder.name)?._count._all || 0 })) })
  } catch (error) {
    console.error('[GET /api/brands/[id]/folders]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/brands/[id]/folders
// Create a new custom folder
export async function POST(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const auth = await checkAuth(request, brandId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    await ensureAssetFolders(brandId)
    const { name } = await request.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
    }

    let folderName: string
    try { folderName = validateFolderName(name) } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }) }

    if (RESERVED_FOLDERS.has(folderName)) {
      return NextResponse.json({ error: 'Reserved folder name' }, { status: 400 })
    }

    const existing = await prisma.brandFolder.findUnique({
      where: {
        brandId_name: { brandId, name: folderName },
      },
    })

    if (existing) {
      return NextResponse.json({ error: 'Folder already exists' }, { status: 400 })
    }

    const folder = await prisma.brandFolder.create({
      data: {
        brandId,
        name: folderName,
      },
    })

    return NextResponse.json({ folder }, { status: 201 })
  } catch (error) {
    console.error('[POST /api/brands/[id]/folders]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

// DELETE /api/brands/[id]/folders
// Delete a folder and move its assets to root ("素材库")
export async function DELETE(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const auth = await checkAuth(request, brandId)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  try {
    await ensureAssetFolders(brandId)
    const url = new URL(request.url)
    const folderId = url.searchParams.get('folderId')
    const name = url.searchParams.get('name')

    if (!folderId && !name) {
      return NextResponse.json({ error: 'folderId or name parameter is required' }, { status: 400 })
    }

    await prisma.$transaction(async tx => {
    const folder = await tx.brandFolder.findFirst({
      where: {
        brandId,
        OR: [
          ...(folderId ? [{ id: folderId }] : []),
          ...(name ? [{ name }] : []),
        ],
      },
    })

    if (!folder) {
      throw Object.assign(new Error('Folder not found'), { status: 404 })
    }

    if (RESERVED_FOLDERS.has(folder.name)) {
      throw Object.assign(new Error('System folders cannot be deleted'), { status: 409 })
    }

    // Move assets and delete the folder in one transaction.
    await tx.mediaAsset.updateMany({
      where: {
        brandId,
        aiCategory: folder.name,
      },
      data: {
        aiCategory: '素材库',
      },
    })

    // 2. Delete the folder record
    await tx.brandFolder.delete({
      where: { id: folder.id },
    })

    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[DELETE /api/brands/[id]/folders]', error)
    return NextResponse.json({ error: error.status ? error.message : 'Folder changed; refresh and retry' }, { status: error.status || 409 })
  }
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const auth = await checkAuth(request, brandId)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  try {
    await ensureAssetFolders(brandId)
    const body = await request.json()
    if (typeof body.folderId !== 'string' || !body.folderId) throw new Error('folderId required')
    const name = validateFolderName(body.name)
    const folder = await prisma.$transaction(async tx => {
      const existing = await tx.brandFolder.findFirst({ where: { id: body.folderId, brandId } })
      if (!existing) throw new Error('Folder not found')
      if (RESERVED_FOLDERS.has(existing.name)) throw new Error('System folders cannot be renamed')
      const updated = await tx.brandFolder.update({ where: { id: existing.id }, data: { name } })
      await tx.mediaAsset.updateMany({ where: { brandId, aiCategory: existing.name }, data: { aiCategory: name } })
      return updated
    }, { isolationLevel: 'Serializable' })
    return NextResponse.json({ folder })
  } catch (error: any) {
    return NextResponse.json({ error: error.code === 'P2002' ? 'Folder already exists' : error.message }, { status: 409 })
  }
}
