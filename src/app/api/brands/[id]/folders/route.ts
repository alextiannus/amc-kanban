import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

const DEFAULT_FOLDERS = ['产品', '环境', '活动']

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
    let folders = await prisma.brandFolder.findMany({
      where: { brandId },
      orderBy: { createdAt: 'asc' },
    })

    if (folders.length === 0) {
      // Auto-seed defaults
      const data = DEFAULT_FOLDERS.map((name) => ({ brandId, name }))
      await prisma.brandFolder.createMany({ data })
      folders = await prisma.brandFolder.findMany({
        where: { brandId },
        orderBy: { createdAt: 'asc' },
      })
    }

    return NextResponse.json({ folders })
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
    const { name } = await request.json()
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Folder name is required' }, { status: 400 })
    }

    const folderName = name.trim()

    if (folderName === '素材库' || folderName === 'raw') {
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
    const url = new URL(request.url)
    const folderId = url.searchParams.get('folderId')
    const name = url.searchParams.get('name')

    if (!folderId && !name) {
      return NextResponse.json({ error: 'folderId or name parameter is required' }, { status: 400 })
    }

    const folder = await prisma.brandFolder.findFirst({
      where: {
        brandId,
        OR: [
          ...(folderId ? [{ id: folderId }] : []),
          ...(name ? [{ name }] : []),
        ],
      },
    })

    if (!folder) {
      return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
    }

    // 1. Move all assets inside this folder back to root "素材库"
    await prisma.mediaAsset.updateMany({
      where: {
        brandId,
        aiCategory: folder.name,
      },
      data: {
        aiCategory: '素材库',
      },
    })

    // 2. Delete the folder record
    await prisma.brandFolder.delete({
      where: { id: folder.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[DELETE /api/brands/[id]/folders]', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
