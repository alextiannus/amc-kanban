import { after, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { canWriteBrandProject } from '@/lib/brandAccess'
import { prisma } from '@/lib/prisma'
import { ownedGoogleLocations, queueGoogleBrandImport, runGoogleBrandImport, selectGoogleLocation } from '@/lib/googleBrandImport'
import { GoogleImportError } from '@/lib/integrations/googleBrandData'
type Params = { params: Promise<{ id: string }> }
async function authorized(id: string) {
  const s = await getSession()
  return !!s?.user && (s.user.type || 'HUMAN') === 'HUMAN' && await canWriteBrandProject(id, s.user.id)
}
export async function GET(request: Request, { params }: Params) {
  const { id } = await params
  if (!await authorized(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    if (new URL(request.url).searchParams.get('locations') === '1') return NextResponse.json({ locations: await ownedGoogleLocations(id) }, { headers: { 'Cache-Control': 'no-store' } })
    const row = await prisma.googleBrandImport.findUnique({ where: { brandId: id }, select: { status: true, lastError: true, result: true, updatedAt: true } })
    return NextResponse.json({ brandId: id, ...(row || { status: 'NOT_STARTED' }) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return NextResponse.json({ error: e instanceof GoogleImportError ? e.code : 'GOOGLE_IMPORT_UNAVAILABLE' }, { status: 422 }) }
}
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  if (!await authorized(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  let body: any
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  try {
    if (body.locationId || body.accountId) await selectGoogleLocation(id, body.accountId, body.locationId)
    else await queueGoogleBrandImport(id, true)
    after(async () => { await runGoogleBrandImport(id) })
    return NextResponse.json({ ok: true, status: 'PENDING' }, { status: 202 })
  } catch (e) { return NextResponse.json({ error: e instanceof GoogleImportError ? e.code : 'GOOGLE_IMPORT_UNAVAILABLE' }, { status: 422 }) }
}
