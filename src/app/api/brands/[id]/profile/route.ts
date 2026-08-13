import { after, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {
  readBrandProfileMarkdown,
  refreshBrandProfileMarkdown,
  writeBrandProfileMarkdown,
  parseDescriptionFromMarkdown,
  parseEditableBrandContextFromMarkdown,
} from '@/lib/brandProfileMarkdown'
import { requestGameShareDraftPoolRefill } from '@/lib/gameShareDraftPool'
import { growthPathsForBrandPatch, growthPathsForKnowledgePatch, queueBrandGrowthSync, syncBrandGrowthState } from '@/lib/brandGrowthSync'

export const maxDuration = 60

type Params = { params: Promise<{ id: string }> }

// GET /api/brands/[id]/profile?refresh=1
export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  const { id } = await params

  // Support both cookie session (human) and Bearer API key (AI agent)
  if (session?.user) {
    const ok = await canSessionAccessBrandProject(
      id,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role
    )
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const url = new URL(request.url)
  const refresh = ['1', 'true', 'yes'].includes((url.searchParams.get('refresh') || '').toLowerCase())

  const profile = refresh
    ? await refreshBrandProfileMarkdown(id)
    : await readBrandProfileMarkdown(id, { ensureExists: true })

  if (!profile) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    brandId: id,
    relativePath: profile.relativePath,
    markdown: profile.markdown,
  })
}

// PATCH /api/brands/[id]/profile
// Body: { markdown: string } OR { refresh: true }
export async function PATCH(request: Request, { params }: Params) {
  const session = await getSession()
  const { id } = await params
  let syncActor: { id: string; email?: string | null; type: string; roles: string[] }

  // Support both cookie session (human owner) and Bearer API key (AI agent)
  if (session?.user) {
    if (!(await canOwnBrand(id, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    syncActor = {
      id: session.user.id,
      email: session.user.email,
      type: session.user.type || 'HUMAN',
      roles: session.user.role ? [session.user.role] : [],
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    syncActor = { id: agent.id, type: 'AI_AGENT', roles: ['AI_AGENT'] }
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>))

  if (body.refresh === true) {
    const refreshed = await refreshBrandProfileMarkdown(id)
    if (!refreshed) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    return NextResponse.json({
      ok: true,
      refreshed: true,
      brandId: id,
      relativePath: refreshed.relativePath,
      markdown: refreshed.markdown,
    })
  }

  if (typeof body.markdown !== 'string' || !body.markdown.trim()) {
    return NextResponse.json({ error: 'markdown is required' }, { status: 400 })
  }

  const saved = await writeBrandProfileMarkdown(id, body.markdown)

  // Extract editable context sections from saved markdown and update database.
  const parsedDesc = parseDescriptionFromMarkdown(body.markdown)
  const parsedContext = parseEditableBrandContextFromMarkdown(body.markdown)
  let updatedBrand = null
  const brandUpdate: Record<string, string | null> = {}
  if (parsedDesc !== null || parsedContext.brand.description !== undefined) {
    const rawDesc = parsedContext.brand.description ?? parsedDesc
    const cleanDesc = rawDesc?.includes('（暂无，请在') ? null : rawDesc?.trim() || null
    brandUpdate.description = cleanDesc
  }
  if (parsedContext.brand.address !== undefined) brandUpdate.address = parsedContext.brand.address
  if (parsedContext.brand.phone !== undefined) brandUpdate.phone = parsedContext.brand.phone
  if (parsedContext.brand.website !== undefined) brandUpdate.website = parsedContext.brand.website

  const knowledgeUpdate: Record<string, unknown> = {}
  const parsedKnowledge = parsedContext.knowledge
  if (parsedKnowledge.businessHours !== undefined) knowledgeUpdate.businessHours = parsedKnowledge.businessHours
  if (parsedKnowledge.reservationUrl !== undefined) knowledgeUpdate.reservationUrl = parsedKnowledge.reservationUrl
  if (parsedKnowledge.orderingUrl !== undefined) knowledgeUpdate.orderingUrl = parsedKnowledge.orderingUrl
  if (parsedKnowledge.stores !== undefined) knowledgeUpdate.stores = parsedKnowledge.stores
  const growthKnowledgePaths = growthPathsForKnowledgePatch(knowledgeUpdate)
  const growthDirtyPaths = [...growthPathsForBrandPatch(brandUpdate), ...growthKnowledgePaths]

  if (Object.keys(brandUpdate).length > 0 || Object.keys(knowledgeUpdate).length > 0) {
    updatedBrand = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const savedBrand = Object.keys(brandUpdate).length > 0
        ? await tx.brand.update({ where: { id }, data: brandUpdate })
        : null
      if (Object.keys(knowledgeUpdate).length > 0) {
        if (Array.isArray(knowledgeUpdate.stores)) {
          const current = await tx.brandKnowledge.findUnique({ where: { brandId: id }, select: { stores: true } })
          const existingStores = Array.isArray(current?.stores)
            ? current.stores.flatMap((item) => item && typeof item === 'object' && !Array.isArray(item)
                ? [{ ...(item as Record<string, unknown>) }]
                : [])
            : []
          knowledgeUpdate.stores = knowledgeUpdate.stores.map((item) => {
            if (!item || typeof item !== 'object' || Array.isArray(item)) return item
            const store = item as Record<string, unknown>
            const storeId = typeof store.storeId === 'string' ? store.storeId : ''
            const existing = existingStores.find(candidate => candidate.storeId === storeId)
            return existing ? { ...existing, ...store } : store
          })
        }
        await tx.brandKnowledge.upsert({
          where: { brandId: id },
          update: knowledgeUpdate,
          create: {
            brandId: id,
            negPrompts: [],
            businessHours: typeof knowledgeUpdate.businessHours === 'string' ? knowledgeUpdate.businessHours : null,
            reservationUrl: typeof knowledgeUpdate.reservationUrl === 'string' ? knowledgeUpdate.reservationUrl : '',
            orderingUrl: typeof knowledgeUpdate.orderingUrl === 'string' ? knowledgeUpdate.orderingUrl : '',
            stores: Array.isArray(knowledgeUpdate.stores) ? knowledgeUpdate.stores : [],
          },
        })
      }
      if (growthDirtyPaths.length) {
        await queueBrandGrowthSync({ brandId: id, dirtyPaths: growthDirtyPaths, actor: syncActor, tx })
      }
      return savedBrand
    })
    if (growthDirtyPaths.length) after(() => syncBrandGrowthState(id).then(() => undefined))
  }

  if (brandUpdate.description !== undefined) {
    after(async () => {
      const gameConfig = await prisma.gameConfig.findUnique({ where: { brandId: id }, select: { id: true } })
      if (gameConfig) await requestGameShareDraftPoolRefill(gameConfig.id)
    })
  }

  return NextResponse.json({
    ok: true,
    updated: true,
    brandId: id,
    relativePath: saved.relativePath,
    markdown: saved.markdown,
    brand: updatedBrand,
  })
}
