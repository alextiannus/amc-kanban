import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { recommendRemoteCopyScripts } from '@/lib/amc-content/remoteContentService'

export async function POST(request: Request) {
  try {
    const session = await getSession()
    if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await request.json().catch(() => ({}))
    const brandId = stringValue(body.brandId)
    const platform = normalizePlatform(stringValue(body.platform))
    if (!brandId || !platform) return NextResponse.json({ error: 'brandId and platform are required' }, { status: 400 })
    const allowed = await canSessionAccessBrandProject(brandId, session.user.id, session.user.type ?? 'HUMAN', session.user.role)
    if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const brand = await prisma.brand.findUnique({ where: { id: brandId }, include: { knowledge: true } })
    if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const market = stringValue(body.market) || normalizeMarket(brand.knowledge?.market || brand.location || '')
    const items = await recommendRemoteCopyScripts({
      brandId,
      platform,
      market,
      industry: stringValue(body.industry) || 'food_beverage',
      primaryCategoryId: stringValue(body.primaryCategoryId) || undefined,
      language: stringValue(body.language) || defaultLanguage(platform),
      contentFormat: stringValue(body.contentFormat) || undefined,
      theme: stringValue(body.theme) || undefined,
    })
    return NextResponse.json({ items, usedScript: items.length > 0 })
  } catch (error: any) {
    console.error('[CopyScriptRecommend] failed:', error)
    return NextResponse.json({ error: error?.message || 'Failed to recommend copy scripts' }, { status: 502 })
  }
}

function stringValue(value: unknown) { return typeof value === 'string' ? value.trim() : '' }
function normalizePlatform(value: string) {
  const platform = value.toLowerCase()
  if (['red', 'rednote', 'xhs', 'xiaohongshu'].includes(platform)) return 'xiaohongshu'
  if (['google', 'google_maps', 'google_business'].includes(platform)) return 'google_business'
  return ['instagram', 'facebook', 'tiktok'].includes(platform) ? platform : ''
}
function normalizeMarket(value: string) {
  const market = value.trim().toLowerCase()
  if (!market || market.includes('singapore') || market === 'sg') return 'SG'
  return value.trim().toUpperCase()
}
function defaultLanguage(platform: string) { return platform === 'xiaohongshu' ? 'zh-CN' : 'en' }
