import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string; assetId: string }> }

async function getActor(request: Request) {
  const session = await getSession()
  const apiKey = extractApiKey(request)
  const authenticatedAgent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (apiKey && !authenticatedAgent) return null
  if (authenticatedAgent) return { id: authenticatedAgent.id, type: authenticatedAgent.type, role: 'USER' }
  if (session?.user) return { id: session.user.id, type: session.user.type ?? 'HUMAN', role: session.user.role }
  return null
}

export async function PATCH(request: Request, { params }: Params) {
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, assetId } = await params
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const existing = await prisma.mediaAsset.findFirst({ where: { id: assetId, brandId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const asset = await prisma.mediaAsset.update({
    where: { id: assetId },
    data: {
      filename: typeof body.filename === 'string' ? body.filename.trim() || null : undefined,
      aiCategory: typeof body.folder === 'string' ? body.folder.trim() || '素材库' : typeof body.aiCategory === 'string' ? body.aiCategory.trim() || '素材库' : undefined,
      aiCaption: typeof body.aiCaption === 'string' ? body.aiCaption.trim() || null : undefined,
      aiTags: Array.isArray(body.aiTags) ? body.aiTags.filter((tag: unknown) => typeof tag === 'string').map((tag: string) => tag.trim()).filter(Boolean) : undefined,
      aiReady: typeof body.aiReady === 'boolean' ? body.aiReady : undefined,
    },
  })

  return NextResponse.json({ ok: true, asset })
}

export async function DELETE(request: Request, { params }: Params) {
  const actor = await getActor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: brandId, assetId } = await params
  const ok = await canSessionAccessBrandProject(brandId, actor.id, actor.type, actor.role)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const asset = await prisma.mediaAsset.findFirst({ where: { id: assetId, brandId }, select: { id: true } })
  if (!asset) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await prisma.mediaAsset.update({ where: { id: assetId }, data: { aiCategory: 'archived', aiReady: false } })
  return NextResponse.json({ ok: true })
}