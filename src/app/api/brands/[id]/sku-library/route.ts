import { after, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { requestGameShareDraftPoolRefill } from '@/lib/gameShareDraftPool'
import {
  buildSkuLibraryResponse,
  serializeSkuLibrary,
} from '@/lib/sku-library/service'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

async function canAccessSkuLibrary(request: Request, brandId: string) {
  const session = await getSession()
  if (session?.user) {
    const ok = await canSessionAccessBrandProject(
      brandId,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role,
    )
    return ok
  }

  const apiKey = extractApiKey(request)
  const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
  if (!agent) return false
  return canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT')
}

export async function GET(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const ok = await canAccessSkuLibrary(request, brandId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const knowledge = await prisma.brandKnowledge.findUnique({
    where: { brandId },
    select: { menuItems: true },
  })

  return NextResponse.json({
    ok: true,
    brandId,
    ...buildSkuLibraryResponse(knowledge?.menuItems),
  })
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: brandId } = await params
  const ok = await canAccessSkuLibrary(request, brandId)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const items = serializeSkuLibrary(body.items ?? body.menuItems)

  const knowledge = await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: { menuItems: items as Prisma.InputJsonValue },
    create: {
      brandId,
      menuItems: items as Prisma.InputJsonValue,
      slangDict: {},
      negPrompts: [],
    },
    select: { menuItems: true },
  })

  after(async () => {
    const gameConfig = await prisma.gameConfig.findUnique({ where: { brandId }, select: { id: true } })
    if (gameConfig) await requestGameShareDraftPoolRefill(gameConfig.id)
  })

  return NextResponse.json({
    ok: true,
    brandId,
    ...buildSkuLibraryResponse(knowledge.menuItems),
  })
}
