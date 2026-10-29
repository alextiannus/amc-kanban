import { prisma } from './prisma'
import { resolveTrustedVideoJobActor } from './videoJobAccess'
import type { VideoProductionJob } from '@prisma/client'

type HistoryRow = Pick<VideoProductionJob, 'id' | 'brandId' | 'title' | 'platform' | 'status' | 'progress' | 'thumbnailUrl' | 'finalVideoUrl' | 'createdAt' | 'updatedAt' | 'plan'>

export const VIDEO_HISTORY_STATUSES = {
  all: undefined,
  active: ['queued', 'generating', 'assembling'],
  review: ['ready_for_review'],
  completed: ['completed'],
  failed: ['failed'],
  cancelled: ['cancelled'],
} as const

const invalid = () => Object.assign(new Error('Invalid video history query'), { status: 400 })
export function videoHistoryQuery(status: unknown, cursor: unknown) {
  const filter = status === undefined || status === '' ? 'all' : status
  if (typeof filter !== 'string' || !Object.hasOwn(VIDEO_HISTORY_STATUSES, filter)) throw invalid()
  let after: { id: string; createdAt: Date } | null = null
  if (cursor !== undefined && cursor !== '') {
    if (typeof cursor !== 'string' || cursor.length > 800) throw invalid()
    try {
      const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
      if (typeof value.id !== 'string' || !value.id || value.id.length > 256 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) throw invalid()
      after = { id: value.id, createdAt: new Date(value.createdAt) }
    } catch { throw invalid() }
  }
  return { filter: filter as keyof typeof VIDEO_HISTORY_STATUSES, after }
}

/** An owner-scoped, read-only projection. Never serialize the complete plan or executions. */
export async function listTrustedVideoJobs(actorId: string, brandId: string, status?: unknown, cursor?: unknown) {
  const { filter, after } = videoHistoryQuery(status, cursor)
  await resolveTrustedVideoJobActor(actorId, brandId, 'READ')
  const owner = { brandId, createdBy: actorId }
  const statuses = VIDEO_HISTORY_STATUSES[filter]
  const [rows, activeCount] = await Promise.all([
    prisma.videoProductionJob.findMany({
      where: { ...owner, ...(statuses ? { status: { in: [...statuses] } } : {}),
        ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21,
      select: { id: true, brandId: true, title: true, platform: true, status: true, progress: true,
        thumbnailUrl: true, finalVideoUrl: true, createdAt: true, updatedAt: true, plan: true },
    }),
    prisma.videoProductionJob.count({ where: { ...owner, status: { in: [...VIDEO_HISTORY_STATUSES.active] } } }),
  ])
  const items = rows.slice(0, 20).map((row: HistoryRow) => {
    const plan = row.plan as { _mmVideoJob?: { language?: unknown; generationStage?: unknown } } | null
    const runtime = plan?._mmVideoJob
    return { id: row.id, brandId: row.brandId, title: row.title, platform: row.platform, status: row.status,
      progress: Math.max(0, Math.min(100, row.progress)), thumbnailUrl: row.thumbnailUrl,
      hasFinalVideo: Boolean(row.finalVideoUrl),
      language: typeof runtime?.language === 'string' && ['zh','en','id','ms','bilingual'].includes(runtime.language) ? runtime.language : null,
      generationStage: typeof runtime?.generationStage === 'string' && /^[a-z_]{1,60}$/.test(runtime.generationStage) ? runtime.generationStage : null,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() }
  })
  const last = items.at(-1)
  return { items, activeCount, nextCursor: rows.length > 20 && last ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt })).toString('base64url') : null }
}
