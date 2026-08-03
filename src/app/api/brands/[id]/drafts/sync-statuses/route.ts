import { NextResponse } from 'next/server'
import { extractApiKey, getAgentFromApiKey, getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { syncBrandDraftStatuses } from '@/lib/syncDraftStatuses'

type Params = { params: Promise<{ id: string }> }

async function canAccess(request: Request, brandId: string) {
  const session = await getSession()
  if (session?.user) {
    return canSessionAccessBrandProject(
      brandId,
      session.user.id,
      session.user.type ?? 'HUMAN',
      session.user.role,
    )
  }

  const apiKey = extractApiKey(request)
  const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
  return agent ? canSessionAccessBrandProject(brandId, agent.id, 'AI_AGENT') : false
}

export async function POST(request: Request, { params }: Params) {
  const { id: brandId } = await params
  if (!(await canAccess(request, brandId))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { postfastApiKey: true },
  })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!brand.postfastApiKey) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'PostFast is not configured' })
  }

  try {
    const sync = await syncBrandDraftStatuses(brandId, brand.postfastApiKey)
    return NextResponse.json({ ok: true, sync })
  } catch (error: unknown) {
    console.error('[drafts/sync-statuses] Sync failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Draft status sync failed' },
      { status: 502 },
    )
  }
}
