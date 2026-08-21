import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canOwnBrand } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

type Params = { params: Promise<{ id: string }> }

function slugify(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/(^-|-$)/g, '')
}

function hashContent(obj: object): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex').slice(0, 16)
}

function growthApiUrl() {
  const isProd = process.env.NODE_ENV === 'production' || process.env.RENDER === 'true'
  return process.env.AMC_GROWTH_API_URL || (isProd ? 'https://amc-growth.onrender.com' : 'http://localhost:4188')
}

function growthHeaders(): Record<string, string> {
  const token = process.env.AMC_KNOWLEDGE_TOKEN || ''
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

async function findGrowthMerchantId(brandName: string): Promise<string | null> {
  try {
    const res = await fetch(`${growthApiUrl()}/v1/merchants`, { headers: growthHeaders() })
    if (!res.ok) return null
    const { merchants } = await res.json()
    const brandSlug = slugify(brandName)
    const match = merchants.find((m: any) =>
      m.name.toLowerCase() === brandName.toLowerCase() ||
      m.merchant_id === brandSlug ||
      brandName.toLowerCase().includes(m.name.toLowerCase()) ||
      m.name.toLowerCase().includes(brandName.toLowerCase())
    )
    return match?.merchant_id ?? null
  } catch {
    return null
  }
}

// POST /api/brands/[id]/brand-story-sync
// Push owner-provided brand data FROM amc-kanban TO amc-growth
export async function POST(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: brandId } = await params
  if (!(await canOwnBrand(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true, description: true },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const knowledge = await prisma.brandKnowledge.findUnique({ where: { brandId } })

  const merchantId = await findGrowthMerchantId(brand.name)
  if (!merchantId) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'merchant_not_in_growth' })
  }

  const payload = {
    story: brand.description || '',
    local_slang: ((knowledge?.slangDict as Record<string, string>) || {}),
  }

  try {
    const res = await fetch(`${growthApiUrl()}/v1/merchants/${merchantId}/brand-story`, {
      method: 'PATCH',
      headers: growthHeaders(),
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      console.error('[brand-story-sync POST] amc-growth PATCH failed:', res.status, errText)
      return NextResponse.json({ ok: false, error: `amc-growth responded ${res.status}` }, { status: 502 })
    }
    return NextResponse.json({ ok: true, merchant_id: merchantId })
  } catch (err: any) {
    console.error('[brand-story-sync POST] network error:', err?.message)
    return NextResponse.json({ ok: false, error: 'growth_unreachable' }, { status: 502 })
  }
}

// GET /api/brands/[id]/brand-story-sync
// Pull latest amc-growth brand-story data; if it changed vs last seen hash,
// create a GROWTH_SYNC notification for the user and return the diff.
export async function GET(request: Request, { params }: Params) {
  const session = await getSession()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id: brandId } = await params
  if (!(await canOwnBrand(brandId, session.user.id))) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { id: true, name: true },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  const knowledge = await prisma.brandKnowledge.findUnique({ where: { brandId } })
  const merchantId = await findGrowthMerchantId(brand.name)
  if (!merchantId) return NextResponse.json({ hasNewData: false, reason: 'merchant_not_in_growth' })

  let growthData: any = null
  try {
    const res = await fetch(`${growthApiUrl()}/v1/merchants/${merchantId}/brand-story`, {
      headers: growthHeaders(),
    })
    if (res.ok) growthData = await res.json()
  } catch {
    return NextResponse.json({ hasNewData: false, reason: 'growth_unreachable' })
  }

  if (!growthData) return NextResponse.json({ hasNewData: false, reason: 'no_growth_data' })

  // Hash of the AMC-research portion only (not owner_input)
  const researchFields = {
    story: growthData.story,
    stores_info: growthData.stores_info,
    positioning: growthData.positioning,
    signature_dishes: growthData.signature_dishes,
    dining_guide: growthData.dining_guide,
  }
  const currentHash = hashContent(researchFields)
  const lastHash = (knowledge as any)?.growthSyncHash

  if (currentHash === lastHash) return NextResponse.json({ hasNewData: false, reason: 'no_change' })

  // New data detected — update hash, create/update GROWTH_SYNC notification
  await prisma.brandKnowledge.upsert({
    where: { brandId },
    update: { growthSyncHash: currentHash } as any,
    create: { brandId, growthSyncHash: currentHash } as any,
  })

  const notifTitle = '🔬 AMC 为您的品牌补充了新调研资料'
  const notifMessage = `AMC 团队更新了【${brand.name}】的品牌资料，包含市场调研与品牌定位建议。请前往「品牌计划」查看并决定是否采纳。`
  const actionUrl = `/dashboard?action=review_growth_sync&brandId=${brandId}`

  const existingNotif = await prisma.notification.findFirst({
    where: { userId: session.user.id, brandId, type: 'GROWTH_SYNC' },
  })
  if (!existingNotif) {
    await prisma.notification.create({
      data: {
        userId: session.user.id,
        brandId,
        type: 'GROWTH_SYNC',
        title: notifTitle,
        message: notifMessage,
        status: 'UNREAD',
        actionUrl,
      },
    })
  } else {
    await prisma.notification.update({
      where: { id: existingNotif.id },
      data: { title: notifTitle, message: notifMessage, status: 'UNREAD', actionUrl },
    })
  }

  return NextResponse.json({ hasNewData: true, merchantId, growthData: researchFields })
}
