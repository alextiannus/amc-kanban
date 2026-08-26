import { NextResponse } from 'next/server'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { buildSkuLibraryResponse, skuLibraryForLLM } from '@/lib/sku-library/service'

export const maxDuration = 30

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim()
}

function hasValidInternalToken(request: Request) {
  const isLocal = process.env.NODE_ENV !== 'production'
    || process.env.APP_BASE_URL?.includes('localhost')
    || process.env.JWT_SECRET?.includes('local')
    || process.env.JWT_SECRET?.includes('change-in-production')
  const expectedToken = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim()
    || (isLocal ? 'local-internal-token' : undefined)
  const suppliedToken = request.headers.get('x-content-service-token')?.trim()
  return Boolean(expectedToken && suppliedToken === expectedToken)
}

export async function POST(request: Request) {
  if (!hasValidInternalToken(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const brandId = stringValue((body as Record<string, unknown>).brandId)
  const actorId = stringValue((body as Record<string, unknown>).actorId)
  const actorType = stringValue((body as Record<string, unknown>).actorType) || 'HUMAN'
  const actorRole = stringValue((body as Record<string, unknown>).actorRole) || 'USER'
  const llmReady = Boolean((body as Record<string, unknown>).llmReady)

  if (!brandId) return NextResponse.json({ error: 'brandId is required' }, { status: 400 })
  if (!actorId) return NextResponse.json({ error: 'actorId is required' }, { status: 400 })

  const ok = await canSessionAccessBrandProject(brandId, actorId, actorType, actorRole)
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true,
      name: true,
      industry: true,
      location: true,
      knowledge: { select: { menuItems: true } },
    },
  })
  if (!brand) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })

  return NextResponse.json({
    ok: true,
    service: 'sku-library.menu-service',
    brand: {
      id: brand.id,
      name: brand.name,
      industry: brand.industry,
      location: brand.location,
    },
    ...buildSkuLibraryResponse(brand.knowledge?.menuItems),
    ...(llmReady ? { llmCatalog: skuLibraryForLLM(brand.knowledge?.menuItems) } : {}),
  })
}
