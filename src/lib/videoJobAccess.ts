import { prisma } from './prisma'
import { canUserAccessBrand } from './user-management/brandAccess'

const notFound = () => Object.assign(new Error('Not found'), { status: 404 })

export async function resolveTrustedVideoJobActor(actorId: string, brandId: string, access: 'READ' | 'WRITE') {
  if (!actorId || !brandId) throw notFound()
  const user = await prisma.user.findUnique({ where: { id: actorId }, select: { id: true, status: true, type: true, role: true } })
  if (user?.status !== 'ACTIVE' || !await canUserAccessBrand(brandId, actorId, access)) throw notFound()
  return { id: user.id, type: user.type, role: user.role }
}

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
