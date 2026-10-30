import type { Prisma, VideoProductionJob } from '@prisma/client'
import { prisma } from './prisma'
import { resolveTrustedVideoJobActor } from './videoJobAccess'
import { requireActorPermission } from './role-permissions/delegation'

const failure = (status: number, message = 'Not found') => Object.assign(new Error(message), { status })
type Reader = Pick<Prisma.TransactionClient, 'videoProductionJob'>

/** Resolve only the persisted language group; never accept a browser-supplied list. */
async function languageGroup(db: Reader, actorId: string, brandId: string, id: string) {
  const rows = new Map<string, VideoProductionJob>()
  const pending = [id]
  while (pending.length) {
    const next = pending.shift()!
    if (rows.has(next)) continue
    if (rows.size >= 4) throw failure(409, 'Video language group changed')
    const row = await db.videoProductionJob.findUnique({ where: { id: next } })
    if (!row || row.createdBy !== actorId || row.brandId !== brandId) throw failure(404)
    rows.set(next, row)
    const links = (row.plan as any)?._mmVideoJob?.editor?.languageJobs
    if (links !== undefined && (!Array.isArray(links) || links.length > 3)) throw failure(409, 'Invalid video language group')
    for (const link of links || []) {
      if (typeof link?.id !== 'string' || !link.id || link.id.length > 256) throw failure(409, 'Invalid video language group')
      pending.push(link.id)
    }
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id))
}

export async function videoHistoryDeletionContext(actorId: string, brandId: string, id: string) {
  await resolveTrustedVideoJobActor(actorId, brandId, 'WRITE')
  await requireActorPermission(actorId, 'content.video-making.create', brandId)
  return languageGroup(prisma, actorId, brandId, id)
}

/** Shares the save boundary's advisory locks so a late save cannot undo deletion. */
export async function deleteVideoHistory(actorId: string, brandId: string, id: string, expectedIds: unknown) {
  const initial = await videoHistoryDeletionContext(actorId, brandId, id)
  const ids = initial.map(row => row.id)
  if (!Array.isArray(expectedIds) || JSON.stringify([...new Set(expectedIds)].sort()) !== JSON.stringify([...ids].sort())) {
    throw failure(409, 'Video language group changed; retry deletion')
  }
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    for (const jobId of [...ids].sort()) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${'video-job:' + jobId}))::text`
    const current = await languageGroup(tx, actorId, brandId, id)
    if (JSON.stringify(current.map(row => row.id)) !== JSON.stringify(ids)) throw failure(409, 'Video language group changed; retry deletion')
    await tx.videoProductionJob.updateMany({
      where: { id: { in: ids }, brandId, createdBy: actorId, historyDeletedAt: null },
      data: { historyDeletedAt: new Date() },
    })
  })
  return { deletedIds: ids }
}
