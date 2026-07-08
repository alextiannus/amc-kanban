import { NextResponse } from 'next/server'
import { getSession, extractApiKey, getAgentFromApiKey } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { syncBrand } from '@/app/api/cron/postfast-sync-all/route'
import { syncBrandDraftStatuses } from '@/lib/syncDraftStatuses'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
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
    if (!ok) return NextResponse.json({ error: 'Unauthorized brand access' }, { status: 403 })
  } else {
    const apiKey = extractApiKey(request)
    const agent = apiKey ? await getAgentFromApiKey(apiKey) : null
    if (!agent) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const ok = await canSessionAccessBrandProject(id, agent.id, 'AI_AGENT')
    if (!ok) return NextResponse.json({ error: 'Unauthorized brand access' }, { status: 403 })
  }

  try {
    // 1. Fetch brand configuration
    const brand = await prisma.brand.findUnique({
      where: { id },
      select: {
        id: true,
        postfastApiKey: true,
        googlePreferOAuth: true,
        googleRefreshToken: true,
        googleLocationId: true,
      },
    })

    if (!brand) {
      return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
    }

    if (!brand.postfastApiKey) {
      return NextResponse.json({ error: '该品牌尚未配置 PostFast API Key，请先绑定账号。' }, { status: 400 })
    }

    // 2. Perform PostFast sync (social accounts + operations report + analytics)
    const { syncedAccounts, operationsReport, analyticsPosts, analyticsUpdatedAt } = await syncBrand(brand)
    const syncedAt = new Date()

    // 3. Update brand in database with the synced snapshot
    const updatedBrand = await prisma.brand.update({
      where: { id: brand.id },
      data: {
        postfastSnapshot: { accounts: syncedAccounts, operationsReport, analyticsPosts, analyticsUpdatedAt },
        postfastSyncedAt: syncedAt,
      },
    })

    // 4. Sync scheduled->published draft statuses
    let draftStatusSync = { updated: 0, checked: 0 }
    try {
      draftStatusSync = await syncBrandDraftStatuses(brand.id, brand.postfastApiKey)
    } catch (syncErr) {
      console.warn(`[sync-postfast] Draft status sync failed (non-fatal):`, syncErr)
    }

    return NextResponse.json({
      ok: true,
      syncedAt,
      accountCount: syncedAccounts.length,
      analyticsPostCount: analyticsPosts.length,
      draftStatusSync,
    })

  } catch (error: any) {
    console.error('[sync-postfast] Sync failed:', error)
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
