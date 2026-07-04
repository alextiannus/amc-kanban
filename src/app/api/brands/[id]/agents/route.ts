import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { avatarSelect, withResolvedAvatar } from '@/lib/avatarUtils'
import { canHumanAccessBrandProject, canWriteBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/brands/[id]/agents — list agents assigned to this brand
 * Accessible by any system user with brand Crew access.
 */
export async function GET(_req: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const hasAccess = await canHumanAccessBrandProject(id, session.user.id, session.user.role)
  if (!hasAccess) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brandAgents = await prisma.brandAgent.findMany({
    where: { brandId: id },
    include: {
      agent: {
        select: {
          id: true, nickname: true, email: true,
          introduction: true, insights: true, themeColor: true, type: true,
          ...avatarSelect,
        },
      },
    },
    orderBy: [{ role: 'asc' }, { createdAt: 'asc' }],
  })

  // Resolve binary avatar data → data URI, same as /api/agents
  const result = brandAgents.map((ba: any) => ({
    ...ba,
    agent: ba.agent ? withResolvedAvatar(ba.agent) : null,
  }))

  return NextResponse.json(result)
}

/**
 * POST /api/brands/[id]/agents — assign an agent to this brand
 * Body: { agentId, role? }
 */
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  if (!(await canWriteBrandProject(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json()
  const { agentId, role = 'worker' } = body
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const agent = await prisma.user.findFirst({ where: { id: agentId, type: 'AI_AGENT' } })
  if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 })

  if (session.user.role !== 'ADMIN') {
    const permission = await prisma.agentPermission.findUnique({
      where: { humanId_agentId: { humanId: session.user.id, agentId } },
      select: { id: true },
    })
    if (!permission) return NextResponse.json({ error: 'Forbidden: agent is not assigned to this principal' }, { status: 403 })
  }

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
  if (!(await canWriteBrandProject(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const agentId = url.searchParams.get('agentId')
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  if (session.user.role !== 'ADMIN') {
    const permission = await prisma.agentPermission.findUnique({
      where: { humanId_agentId: { humanId: session.user.id, agentId } },
      select: { id: true },
    })
    if (!permission) return NextResponse.json({ error: 'Forbidden: agent is not assigned to this principal' }, { status: 403 })
  }

  await prisma.brandAgent.deleteMany({ where: { brandId: id, agentId } })
  return NextResponse.json({ ok: true })
}
