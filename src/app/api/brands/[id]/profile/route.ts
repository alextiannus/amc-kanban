import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import {
  readBrandProfileMarkdown,
  refreshBrandProfileMarkdown,
  writeBrandProfileMarkdown,
  parseDescriptionFromMarkdown,
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

  // Extract description from saved markdown and update database
  const parsedDesc = parseDescriptionFromMarkdown(body.markdown)
  let updatedBrand = null
  if (parsedDesc !== null) {
    const cleanDesc = parsedDesc.includes('（暂无，请在') ? null : parsedDesc.trim() || null
    updatedBrand = await prisma.brand.update({
      where: { id },
      data: { description: cleanDesc }
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
