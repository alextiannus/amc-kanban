import { NextResponse } from 'next/server'
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

  // Support both cookie session (human owner) and Bearer API key (AI agent)
  if (session?.user) {
    if (!(await canOwnBrand(id, session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
  if (parsedContext.brand.location !== undefined) brandUpdate.location = parsedContext.brand.location
  if (parsedContext.brand.address !== undefined) brandUpdate.address = parsedContext.brand.address
  if (parsedContext.brand.phone !== undefined) brandUpdate.phone = parsedContext.brand.phone
  if (parsedContext.brand.website !== undefined) brandUpdate.website = parsedContext.brand.website

  if (Object.keys(brandUpdate).length > 0) {
    updatedBrand = await prisma.brand.update({
      where: { id },
      data: brandUpdate
    })
  }

  const knowledgeUpdate: Record<string, unknown> = {}
  const parsedKnowledge = parsedContext.knowledge
  if (parsedKnowledge.brandTone !== undefined) knowledgeUpdate.brandTone = parsedKnowledge.brandTone
  if (parsedKnowledge.audienceAssumptions !== undefined) knowledgeUpdate.audienceAssumptions = parsedKnowledge.audienceAssumptions
  if (parsedKnowledge.productAssumptions !== undefined) knowledgeUpdate.productAssumptions = parsedKnowledge.productAssumptions
  if (parsedKnowledge.businessHours !== undefined) knowledgeUpdate.businessHours = parsedKnowledge.businessHours
  if (parsedKnowledge.reservationUrl !== undefined) knowledgeUpdate.reservationUrl = parsedKnowledge.reservationUrl
  if (parsedKnowledge.orderingUrl !== undefined) knowledgeUpdate.orderingUrl = parsedKnowledge.orderingUrl
  if (parsedKnowledge.stores !== undefined) knowledgeUpdate.stores = parsedKnowledge.stores

  if (parsedKnowledge.promoPlan || parsedKnowledge.publishingFreq) {
    const existing = await prisma.brandKnowledge.findUnique({
      where: { brandId: id },
      select: { promoPlan: true, publishingFreq: true },
    })
    if (parsedKnowledge.promoPlan) {
      knowledgeUpdate.promoPlan = {
        ...((existing?.promoPlan as Record<string, unknown> | null) ?? {}),
        ...parsedKnowledge.promoPlan,
      }
    }
    if (parsedKnowledge.publishingFreq) {
      const existingFreq = (existing?.publishingFreq as Record<string, unknown> | null) ?? {}
      const existingPlatforms = (
        existingFreq.platforms && typeof existingFreq.platforms === 'object' && !Array.isArray(existingFreq.platforms)
          ? existingFreq.platforms as Record<string, unknown>
          : {}
      )
      knowledgeUpdate.publishingFreq = {
        ...existingFreq,
        ...parsedKnowledge.publishingFreq,
        platforms: {
          ...existingPlatforms,
          ...(parsedKnowledge.publishingFreq.platforms ?? {}),
        },
      }
    }
  }

  if (Object.keys(knowledgeUpdate).length > 0) {
    await prisma.brandKnowledge.upsert({
      where: { brandId: id },
      update: knowledgeUpdate,
      create: {
        brandId: id,
        brandTone: typeof knowledgeUpdate.brandTone === 'string' ? knowledgeUpdate.brandTone : '',
        negPrompts: [],
        audienceAssumptions: typeof knowledgeUpdate.audienceAssumptions === 'string' ? knowledgeUpdate.audienceAssumptions : '',
        productAssumptions: typeof knowledgeUpdate.productAssumptions === 'string' ? knowledgeUpdate.productAssumptions : '',
        businessHours: knowledgeUpdate.businessHours ?? null,
        reservationUrl: typeof knowledgeUpdate.reservationUrl === 'string' ? knowledgeUpdate.reservationUrl : '',
        orderingUrl: typeof knowledgeUpdate.orderingUrl === 'string' ? knowledgeUpdate.orderingUrl : '',
        stores: Array.isArray(knowledgeUpdate.stores) ? knowledgeUpdate.stores : [],
        promoPlan: knowledgeUpdate.promoPlan ?? null,
        publishingFreq: knowledgeUpdate.publishingFreq ?? null,
      },
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
