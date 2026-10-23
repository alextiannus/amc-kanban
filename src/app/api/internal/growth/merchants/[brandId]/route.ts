import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { growthDirectoryAuthorized, growthMerchantSelect, growthMerchantRecord } from '@/lib/growthMerchantDirectory'

export const dynamic = 'force-dynamic'
export async function GET(request: Request, { params }: { params: Promise<{ brandId: string }> }) {
  if (!growthDirectoryAuthorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { brandId } = await params
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(brandId)) return NextResponse.json({ error: 'invalid_brand_id' }, { status: 400 })
  const brand = await prisma.brand.findFirst({ where: { id: brandId, status: { not: 'ARCHIVED' } }, select: growthMerchantSelect })
  return brand ? NextResponse.json({ merchant: growthMerchantRecord(brand) }) : NextResponse.json({ error: 'kanban_merchant_not_found' }, { status: 404 })
}
