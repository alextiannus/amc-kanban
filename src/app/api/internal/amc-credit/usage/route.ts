import { NextResponse } from 'next/server'
import { releaseCredit, reserveCredit, settleCredit } from '@/lib/amc-credit/service'

function authorized(request: Request) {
  const local = process.env.NODE_ENV !== 'production' || process.env.APP_BASE_URL?.includes('localhost')
  const expected = process.env.CONTENT_SERVICE_INTERNAL_TOKEN?.trim() || (local ? 'local-internal-token' : '')
  return Boolean(expected) && request.headers.get('x-content-service-token')?.trim() === expected
}

function responsePayload(result: any) {
  if (!result || typeof result !== 'object') return result
  const entry = result.entry ? { id: result.entry.id, kind: result.entry.kind, creditDelta: result.entry.creditDelta, taskId: result.entry.taskId, createdAt: result.entry.createdAt } : null
  const summary = result.snapshot?.summary
  return { entry, ...(summary ? { summary } : {}) }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json().catch(() => null) as any
  if (!body || !['reserve', 'settle', 'release'].includes(body.action) || typeof body.brandId !== 'string' || typeof body.taskId !== 'string' || typeof body.idempotencyKey !== 'string') return NextResponse.json({ error: 'Invalid AMC Credit usage request' }, { status: 400 })
  try {
    if (body.action === 'reserve') return NextResponse.json(responsePayload(await reserveCredit({ brandId: body.brandId, taskType: String(body.taskType || 'unknown'), taskId: body.taskId, credit: Number(body.credit), idempotencyKey: body.idempotencyKey, rawUsage: body.rawUsage, metadata: body.metadata })))
    if (body.action === 'release') return NextResponse.json(responsePayload({ entry: await releaseCredit({ brandId: body.brandId, taskId: body.taskId, reservationKey: String(body.reservationKey || ''), idempotencyKey: body.idempotencyKey }) }))
    return NextResponse.json(responsePayload(await settleCredit({ brandId: body.brandId, taskType: String(body.taskType || 'unknown'), taskId: body.taskId, credit: Number(body.credit), idempotencyKey: body.idempotencyKey, reservationKey: typeof body.reservationKey === 'string' ? body.reservationKey : undefined, rawUsage: body.rawUsage, internalCostMicros: body.internalCostMicros === undefined ? undefined : BigInt(body.internalCostMicros), metadata: body.metadata })))
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'AMC Credit update failed', code: error.code }, { status: error.status || 400 })
  }
}
