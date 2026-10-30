import { timingSafeEqual } from 'node:crypto'
import { readTrustedVideoJob, resolveTrustedVideoJobActor } from '@/lib/videoJobAccess'
import { serializeTrustedVideoJob } from '@/lib/videoJobContract'
import { saveVideoJob } from '@/lib/videoJobPersistence'
import { listTrustedVideoJobs } from '@/lib/videoJobHistory'
import { videoHistoryDeletionContext, deleteVideoHistory } from '@/lib/videoJobDeletion'

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
    if (Buffer.byteLength(raw, 'utf8') > 9 * 1024 * 1024) return Response.json({ error: 'video_job_payload_too_large' }, { status: 413 })
    const body = JSON.parse(raw)
    const actorId = text(body?.actorId)
    if (body?.action === 'history_delete_context' || body?.action === 'delete_history') {
      const id = text(body.id), brandId = text(body.brandId)
      if (!actorId || !id || !brandId || body.job !== undefined) return Response.json({ error: 'actorId, id and brandId are required' }, { status: 400 })
      if (body.action === 'history_delete_context') {
        const jobs = await videoHistoryDeletionContext(actorId, brandId, id)
        return Response.json({ success: true, jobs: jobs.map(job => ({ ...serializeTrustedVideoJob(job), historyDeletedAt: job.historyDeletedAt })) }, { headers: { 'Cache-Control': 'no-store' } })
      }
      const deleted = await deleteVideoHistory(actorId, brandId, id, body.expectedIds)
      const { activeCount } = await listTrustedVideoJobs(actorId, brandId)
      return Response.json({ success: true, ...deleted, activeCount }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (body?.action === 'list') {
      const brandId = text(body.brandId)
      if (!actorId || !brandId || body.job !== undefined) return Response.json({ error: 'actorId and brandId are required' }, { status: 400 })
      const history = await listTrustedVideoJobs(actorId, brandId, body.status, body.cursor)
      return Response.json({ success: true, ...history }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (body?.job !== undefined) {
      if (!actorId || !body.job || typeof body.job !== 'object' || Array.isArray(body.job)) return Response.json({ error: 'actorId and job are required' }, { status: 400 })
      const brandId = text(body.job.brandId)
      if (!brandId) return Response.json({ error: 'job.brandId is required' }, { status: 400 })
      const actor = await resolveTrustedVideoJobActor(actorId, brandId, 'WRITE')
      const job = await saveVideoJob(actor, body.job)
      return Response.json({ success: true, job: serializeTrustedVideoJob(job) }, { headers: { 'Cache-Control': 'no-store' } })
    }
    const id = text(body?.id)
    const brandId = text(body?.brandId)
    if (!actorId || !id) return Response.json({ error: 'actorId and id are required' }, { status: 400 })
    const job = await readTrustedVideoJob(actorId, id, brandId || undefined)
    return Response.json({ success: true, job: serializeTrustedVideoJob(job) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    const hidden = error?.status === 403 || error?.status === 404
    return Response.json({ error: error instanceof SyntaxError ? 'Invalid JSON' : hidden ? 'Not found' : error.message || 'Video job request failed' }, {
      status: error instanceof SyntaxError ? 400 : hidden ? 404 : typeof error?.status === 'number' ? error.status : 503,
    })
  }
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
