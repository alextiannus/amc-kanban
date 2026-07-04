import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'

type Params = { params: Promise<{ id: string }> }

export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params

  // Authorize session or API Key
  if (session?.user) {
    const ok = await canSessionAccessBrandProject(
      brandId,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role
    )
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Find or return defaults
  const knowledge = await prisma.brandKnowledge.findUnique({
    where: { brandId },
  })

  if (!knowledge) {
    return NextResponse.json({
      brandId,
      brandTone: '',
      slangDict: {},
      negPrompts: [],
      menuItems: [],
    })
  }

  return NextResponse.json({
    brandId,
    brandTone: knowledge.brandTone || '',
    slangDict: knowledge.slangDict || {},
    negPrompts: knowledge.negPrompts || [],
    menuItems: knowledge.menuItems || [],
  })
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  const { id: brandId } = await params

  // Authorize: only humans owning the brand or authorized agents can update it
  if (session?.user) {
    if (!(await canOwnBrand(brandId, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = await request.json().catch(() => ({}))

  const { brandTone, slangDict, negPrompts, menuItems } = body

  // Update or Create
  const knowledge = await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: {
      ...(brandTone !== undefined && { brandTone }),
      ...(slangDict !== undefined && { slangDict }),
      ...(negPrompts !== undefined && { negPrompts }),
      ...(menuItems !== undefined && { menuItems }),
    },
    create: {
      brandId,
      brandTone: brandTone || '',
      slangDict: slangDict || {},
      negPrompts: negPrompts || [],
      menuItems: menuItems || [],
    },
  })

  return NextResponse.json({
    ok: true,
    brandId,
    brandTone: knowledge.brandTone,
    slangDict: knowledge.slangDict,
    negPrompts: knowledge.negPrompts,
    menuItems: knowledge.menuItems,
  })
}
