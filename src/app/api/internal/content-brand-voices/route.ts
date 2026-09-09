import { NextResponse } from 'next/server'
import { canSessionAccessBrandProject } from '@/lib/brandAccess'
import { generateContentBrandVoice, listContentBrandVoices, resolveContentBrandVoice } from '@/lib/contentBrandVoices'

export const maxDuration = 150
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const local = process.env.NODE_ENV !== 'production' || process.env.APP_BASE_URL?.includes('localhost')
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() || (local ? 'local-internal-token' : '')
  if (!expected || request.headers.get('x-content-service-token')?.trim() !== expected) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const brandId = typeof body?.brandId === 'string' ? body.brandId.trim() : ''
  const actorId = typeof body?.actorId === 'string' ? body.actorId.trim() : ''
  const actorRole = typeof body?.actorRole === 'string' ? body.actorRole : ''
  if (!brandId || !actorId) return NextResponse.json({ error: 'brandId and actorId are required' }, { status: 400 })
  if (!['ADMIN', 'AMC_PRINCIPAL', 'RESEARCHER'].includes(actorRole)
    || !await canSessionAccessBrandProject(brandId, actorId, 'HUMAN', actorRole)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    if (body.action === 'list') return NextResponse.json(await listContentBrandVoices(brandId))
    if (!['ADMIN', 'AMC_PRINCIPAL'].includes(actorRole)) return NextResponse.json({ error: 'Operator role required' }, { status: 403 })
    if (typeof body.brandVoiceProfileId !== 'string' || !body.brandVoiceProfileId) return NextResponse.json({ error: 'brandVoiceProfileId is required' }, { status: 400 })
    if (body.action === 'resolve') return NextResponse.json({ selection: await resolveContentBrandVoice(brandId, body.brandVoiceProfileId, body.expected) })
    if (body.action === 'preview' || body.action === 'generate') {
      return NextResponse.json(await generateContentBrandVoice({ brandId, actorId, actorRole,
        brandVoiceProfileId: body.brandVoiceProfileId, text: typeof body.text === 'string' ? body.text : '',
        expected: body.expected, speed: body.speed, volume: body.volume, pitch: body.pitch }))
    }
    return NextResponse.json({ error: 'Unsupported voice action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Merchant voice failed' }, { status: Number((e as { status?: number }).status) || 502 })
  }
}
