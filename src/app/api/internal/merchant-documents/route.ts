import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { jobBinding, signBinding, type Binding } from '@/lib/global-text/policy'
import { assetAnalysisContentConfig } from '@/lib/asset-analysis/content'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120
function authorized(request: Request) {
  const token = process.env.CONTENT_SERVICE_INTERNAL_TOKEN
  return !!token && request.headers.get('x-content-service-token') === token
}
async function content(binding: Binding, body?: unknown, id?: string) {
  if (!Number.isInteger(binding.modelRevision)) throw new Error('Published unified model policy required')
  const config = assetAnalysisContentConfig()
  const response = await fetch(`${config.baseUrl}/v1/asset-analysis/documents${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
    method: body ? 'POST' : 'GET', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json', 'x-amc-text-binding': signBinding(binding) },
    ...(body ? { body: JSON.stringify({ ...body as object, configurationVersion: binding.modelRevision }) } : {}),
    cache: 'no-store', signal: AbortSignal.timeout(110000),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) throw new Error('Merchant document service unavailable; query existing jobs before retrying')
  return result
}
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null)
  if (!body || typeof body.url !== 'string' || body.url.length > 16000 || typeof body.idempotencyKey !== 'string' || !body.idempotencyKey.trim() || body.idempotencyKey.length > 256 || !Number.isInteger(body.maxPages) || body.maxPages < 1 || body.maxPages > 20) return NextResponse.json({ error: 'Invalid merchant document request' }, { status: 400 })
  try {
    const key = createHash('sha256').update(body.idempotencyKey).digest('hex')
    const binding = await jobBinding('kanban', `merchant-document:${key}`)
    const merchant = { name: String(body.merchant?.name || '').slice(0, 200), address: String(body.merchant?.address || '').slice(0, 500), placeId: String(body.merchant?.placeId || '').slice(0, 200) }
    return NextResponse.json(await content(binding, { url: body.url, maxPages: body.maxPages, idempotencyKey: body.idempotencyKey, merchant }), { status: 202 })
  } catch { return NextResponse.json({ error: 'Unified merchant document service unavailable' }, { status: 503 }) }
}
export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = new URL(request.url).searchParams.get('id')
  if (!id || !id.startsWith('central-asset:') || id.length > 256) return NextResponse.json({ error: 'Invalid document job ID' }, { status: 400 })
  try {
    const rows: any[] = await prisma.$queryRawUnsafe('SELECT version FROM "ModelOperation" WHERE id=$1', id)
    if (!rows[0]) return NextResponse.json({ error: 'Document task not found' }, { status: 404 })
    // Querying never binds the task to the current revision or exposes connections.
    const binding: Binding = { version: rows[0].version, modelRevision: rows[0].version, source: 'kanban', enabled: true, connectionId: null, fingerprint: null, expires: Date.now() + 86400000 }
    return NextResponse.json(await content(binding, undefined, id))
  } catch { return NextResponse.json({ error: 'Merchant document query unavailable' }, { status: 503 }) }
}
