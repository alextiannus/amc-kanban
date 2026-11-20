import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { fetchBrandKeywords } from '@/lib/promotion-strategy/clients'
import { brainstormTagContext } from '@/lib/ai-native/brainstorm-match'
import { refreshBrainstorm } from '@/lib/ai-native/brainstorm'

type Context = { params: Promise<{ id: string }> }
type Actor = { id: string; email?: string | null; type: string }

async function actorFor(request: Request): Promise<Actor | null> {
  const session = await getSession()
  if (session?.user) return { id: session.user.id, email: session.user.email, type: session.user.type || 'HUMAN' }
  const key = extractApiKey(request)
  const actor = key ? await getAgentFromApiKey(key) : null
  return actor ? { id: actor.id, email: actor.email, type: actor.type } : null
}

const forbiddenDefaults = new Set(['会员优惠', '团购套餐', '节日活动', '当前热门', '餐饮', 'restaurant', 'group buying'])

export async function PUT(request: Request, context: Context) {
  const actor = await actorFor(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: brandId } = await context.params
  if (!await canWriteBrandProject(brandId, actor.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const industry = typeof body.industry === 'string' ? body.industry.trim().slice(0, 160) : ''
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 5000) : ''
  const source = body.source === 'production_correction' ? 'production_correction' : 'user_confirmed_profile'
  const services = Array.isArray(body.services) ? body.services.slice(0, 24).map((value: any, index: number) => ({
    id: String(value?.id || `service-${index + 1}`).trim().slice(0, 80),
    name: String(value?.name || value?.label || '').trim().slice(0, 160),
    label: String(value?.label || value?.name || '').trim().slice(0, 160),
    category: industry,
    type: 'service',
  })).filter((value: any) => value.id && value.name) : []
  const keywords = Array.isArray(body.keywords) ? [...new Set<string>(body.keywords.map((value: unknown) => String(value).trim()).filter(Boolean))].filter(value => !forbiddenDefaults.has(value.toLowerCase())).slice(0, 24) : []
  if (!industry || !description || !services.length || !keywords.length) return NextResponse.json({ error: 'industry, description, services and keywords are required' }, { status: 400 })

  const confirmedAt = new Date().toISOString()
  const snapshot = await prisma.$transaction(async tx => {
    const current = await tx.brand.findUnique({ where: { id: brandId }, select: { id: true, name: true, description: true, industry: true, knowledge: { select: { menuItems: true, brandClaim: true } } } })
    if (!current) return null
    const claim = current.knowledge?.brandClaim && typeof current.knowledge.brandClaim === 'object' && !Array.isArray(current.knowledge.brandClaim) ? current.knowledge.brandClaim as Record<string, unknown> : {}
    await tx.brand.update({ where: { id: brandId }, data: { industry, description, location: null, address: null } })
    await tx.brandKnowledge.upsert({
      where: { brandId },
      create: { brandId, negPrompts: [], menuItems: services, brandClaim: { ...claim, onboardingProfile: { brandType: 'personal_ip', industry, services, keywords, source, confirmedAt }, creativeBootstrap: { state: 'PENDING', updatedAt: confirmedAt } } },
      update: { menuItems: services, brandClaim: { ...claim, onboardingProfile: { brandType: 'personal_ip', industry, services, keywords, source, confirmedAt }, creativeBootstrap: { state: 'PENDING', updatedAt: confirmedAt } } },
    })
    await tx.auditLog.create({ data: {
      actorId: actor.id, actorType: actor.type, actorName: actor.email || null,
      action: 'PERSONAL_IP_PROFILE_CONFIRMED', resourceType: 'Brand', resourceId: brandId,
      oldValue: { industry: current.industry, description: current.description, services: current.knowledge?.menuItems || [], onboardingProfile: (claim as any).onboardingProfile || null },
      newValue: { brandType: 'personal_ip', industry, description, services, keywords, source, confirmedAt },
      metadata: { brandId, source, forceMatch: body.forceMatch !== false },
    } })
    return { id: current.id, name: current.name, industry, description, services, keywords, source, confirmedAt }
  })
  if (!snapshot) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  try {
    const currentKeywords = await fetchBrandKeywords({ action: 'read', brandId, context: brainstormTagContext({ id: brandId, name: snapshot.name, industry, description, productCatalog: services }, '') })
    const savedKeywords = await fetchBrandKeywords({ action: 'save', brandId, actorId: actor.id, expectedRevision: currentKeywords.revision, entries: keywords.map(label => ({ label })) })
    const feed = body.forceMatch === false ? null : await refreshBrainstorm(actor.id, brandId, { action: 'refresh', force: true })
    return NextResponse.json({ ok: true, profile: snapshot, keywordRevision: savedKeywords.revision, keywords: savedKeywords.tags, matchStatus: feed?.matchStatus || 'PENDING', playableIdeas: Array.isArray(feed?.items) ? feed.items.length : null }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    const row = await prisma.brandKnowledge.findUnique({ where: { brandId }, select: { brandClaim: true } })
    const claim = row?.brandClaim && typeof row.brandClaim === 'object' && !Array.isArray(row.brandClaim) ? row.brandClaim as Record<string, unknown> : {}
    await prisma.brandKnowledge.update({ where: { brandId }, data: { brandClaim: { ...claim, creativeBootstrap: { state: 'FAILED', error: 'creative_match_failed', updatedAt: new Date().toISOString() } } } }).catch(() => undefined)
    throw error
  }
}
