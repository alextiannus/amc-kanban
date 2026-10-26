import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canOwnBrand } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { brandGoogleMapsEntries } from '@/lib/brandFollowLinks'
import { parseGoogleMapsEntry } from '@/lib/googleMapsEntry'

type Params = { params: Promise<{ id: string }> }
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || !await canOwnBrand(id, session.user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const brand = await prisma.brand.findUnique({ where: { id }, select: { name: true, address: true, location: true, knowledge: { select: { stores: true } }, accounts: { where: { unboundAt: null, NOT: { handle: 'unconfigured' } }, select: { platformId: true, profileUrl: true, handle: true } }, googlePlaceId: true, googleBusinessUrl: true, googleReviewUrl: true, googleBrandImport: { select: { status: true, lastError: true } } } })
  if (!brand) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const entries = brandGoogleMapsEntries(brand, brand.knowledge?.stores)
  const mapsUrl = entries[0]?.url || ''
  return NextResponse.json({ brandId: id, mapsUrl, entries, ready: entries.length > 0, exact: entries.some(entry => entry.kind === 'place'), googleSync: brand.googleBrandImport }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function PUT(request: Request, { params }: Params) {
  const { id } = await params
  const session = await getSession()
  if (!session?.user || !await canOwnBrand(id, session.user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const origin = request.headers.get('origin')
  if ((origin && !['https://amc.immedi.ai', 'https://amc-mm.immedi.ai', 'https://amc-kanban.immedi.ai', new URL(request.url).origin].includes(origin)) || request.headers.get('sec-fetch-site') === 'cross-site') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  let entry: ReturnType<typeof parseGoogleMapsEntry>
  try { const body = await request.json(); entry = parseGoogleMapsEntry(body.mapsUrl) }
  catch { return NextResponse.json({ error: 'INVALID_MAP_LINK' }, { status: 400 }) }
  // This public destination is independent of account authorization and game configuration.
  await prisma.brand.update({ where: { id }, data: { ...entry, googleLinksMeta: { source: 'merchant-confirmed-map-link', observedAt: new Date().toISOString() } } })
  return NextResponse.json({ ok: true, brandId: id, mapsUrl: entry.googleBusinessUrl, ready: true }, { headers: { 'Cache-Control': 'no-store' } })
}
