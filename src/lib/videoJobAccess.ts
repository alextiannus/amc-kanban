import { prisma } from './prisma'
import { canUserAccessBrand } from './user-management/brandAccess'

const notFound = () => Object.assign(new Error('Not found'), { status: 404 })

/** Resolve the full persistence row for a trusted service without weakening the end-user owner boundary. */
export async function readTrustedVideoJob(actorId: string, id: string, brandId?: string) {
  if (!actorId || !id) throw notFound()
  const [user, job] = await Promise.all([
    prisma.user.findUnique({ where: { id: actorId }, select: { status: true } }),
    prisma.videoProductionJob.findFirst({ where: { id, ...(brandId ? { brandId } : {}) } }),
  ])
  if (user?.status !== 'ACTIVE' || !job || !job.createdBy || job.createdBy !== actorId) throw notFound()
  if (!await canUserAccessBrand(job.brandId, actorId, 'READ')) throw notFound()
  return job
}
