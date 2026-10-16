import { timingSafeEqual } from 'node:crypto'
import { readTrustedVideoJob } from '@/lib/videoJobAccess'
import { serializeTrustedVideoJob } from '@/lib/videoJobContract'

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

function authorized(request: Request) {
  const expected = Buffer.from(process.env.CONTENT_SERVICE_INTERNAL_TOKEN || '')
  const actual = Buffer.from(request.headers.get('x-content-service-token') || '')
  return Boolean(expected.length && expected.length === actual.length && timingSafeEqual(expected, actual))
}

export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized()
  try {
    const raw = await request.text()
    if (Buffer.byteLength(raw, 'utf8') > 4096) return Response.json({ error: 'video_job_lookup_too_large' }, { status: 413 })
    const body = JSON.parse(raw)
    const actorId = text(body?.actorId)
    const id = text(body?.id)
    const brandId = text(body?.brandId)
    if (!actorId || !id) return Response.json({ error: 'actorId and id are required' }, { status: 400 })
    const job = await readTrustedVideoJob(actorId, id, brandId || undefined)
    return Response.json({ success: true, job: serializeTrustedVideoJob(job) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return Response.json({ error: error instanceof SyntaxError ? 'Invalid JSON' : error.message || 'Video job lookup failed' }, {
      status: error instanceof SyntaxError ? 400 : typeof error?.status === 'number' ? error.status : 503,
    })
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
