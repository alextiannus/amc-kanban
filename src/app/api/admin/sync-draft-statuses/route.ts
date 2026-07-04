/**
 * POST /api/admin/sync-draft-statuses
 *
 * Admin-only manual trigger to sync scheduled→published/failed ContentDraft
 * statuses for all active brands (or a specific brand via ?brandId=...).
 *
 * Usage:
 *   curl -X POST https://<host>/api/admin/sync-draft-statuses \
 *        -H "Cookie: <session_cookie>"
 *
 *   Or with brandId filter:
 *   curl -X POST "https://<host>/api/admin/sync-draft-statuses?brandId=<id>" \
 *        -H "Cookie: <session_cookie>"
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { syncBrandDraftStatuses } from '@/lib/syncDraftStatuses'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user || session.user.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(req.url)
  const filterBrandId = url.searchParams.get('brandId')

  const brands = await prisma.brand.findMany({
    where: {
      ...(filterBrandId ? { id: filterBrandId } : { status: 'ACTIVE' }),
      postfastApiKey: { not: null },
    },
    select: { id: true, name: true, postfastApiKey: true },
  })

  if (brands.length === 0) {
    return NextResponse.json({ ok: true, message: 'No brands found to sync', results: [] })
  }

  const results: Array<{
    brandId: string
    brandName: string
    checked: number
    updated: number
    updates: Array<{ draftId: string; from: string; to: string; publishedAt?: string }>
    errors: string[]
  }> = []

  for (const brand of brands) {
    if (!brand.postfastApiKey) continue
    try {
      const syncResult = await syncBrandDraftStatuses(brand.id, brand.postfastApiKey)
      results.push({
        brandId: brand.id,
        brandName: brand.name,
        ...syncResult,
      })
      console.log(
        `[admin/sync-draft-statuses] brand "${brand.name}" (${brand.id}):`,
        `checked=${syncResult.checked}, updated=${syncResult.updated}`,
        syncResult.updates,
      )
    } catch (e: any) {
      results.push({
        brandId: brand.id,
        brandName: brand.name,
        checked: 0,
        updated: 0,
        updates: [],
        errors: [e?.message ?? String(e)],
      })
    }
  }

  const totalUpdated = results.reduce((s, r) => s + r.updated, 0)
  const totalChecked = results.reduce((s, r) => s + r.checked, 0)

  return NextResponse.json({
    ok: true,
    totalChecked,
    totalUpdated,
    brands: results.length,
    results,
  })
}
