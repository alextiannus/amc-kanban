import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/brands/[id]/agents — list agents assigned to this brand
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const agents = await prisma.brandAgent.findMany({
    where: { brandId: id },
    include: {
      agent: {
        select: { id: true, nickname: true, email: true, avatar: true, introduction: true, themeColor: true, type: true },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })

  return NextResponse.json(agents)
}

/**
 * POST /api/brands/[id]/agents — assign an agent to this brand
 * Body: { agentId, role? }
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json()
  const { agentId, role = 'worker' } = body
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const agent = await prisma.user.findFirst({ where: { id: agentId, type: 'AI_AGENT' } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  const link = await prisma.brandAgent.upsert({
    where: { brandId_agentId: { brandId: id, agentId } },
    create: { brandId: id, agentId, role, active: true },
    update: { role, active: true },
    include: { agent: { select: { id: true, nickname: true, avatar: true, type: true } } },
  })

  return NextResponse.json(link, { status: 201 })
}

/**
 * DELETE /api/brands/[id]/agents?agentId=<id> — remove agent from brand
 */
export async function DELETE(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const brand = await prisma.brand.findFirst({ where: { id, ownerId: session.user.id } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const agentId = url.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  await prisma.brandAgent.deleteMany({ where: { brandId: id, agentId } })
  return NextResponse.json({ ok: true })
}
