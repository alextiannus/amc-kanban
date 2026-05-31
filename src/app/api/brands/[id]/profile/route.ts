import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canOwnBrand, canSessionAccessBrandProject } from '@/lib/brandAccess'
import {
  readBrandProfileMarkdown,
  refreshBrandProfileMarkdown,
  writeBrandProfileMarkdown,
} from '@/lib/brandProfileMarkdown'

type Params = { params: Promise<{ id: string }> }

// GET /api/brands/[id]/profile?refresh=1
export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const ok = await canSessionAccessBrandProject(
    id,
    session.user.id,
    session.user.type ?? 'HUMAN',
    session.user.role
  )
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

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
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  if (session.user.type === 'AI_AGENT') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  if (!(await canOwnBrand(id, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
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

  return NextResponse.json({
    ok: true,
    updated: true,
    brandId: id,
    relativePath: saved.relativePath,
    markdown: saved.markdown,
  })
}
