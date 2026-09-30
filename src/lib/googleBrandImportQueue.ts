import { createHash } from 'node:crypto'
import { prisma } from './prisma.ts'

export const configSelect = { id: true, status: true, googleRefreshToken: true, googleClientId: true, googleClientSecret: true, googleAccountId: true, googleLocationId: true, postfastApiKey: true,
  accounts: { where: { unboundAt: null }, orderBy: { id: 'asc' }, select: { id: true, platformId: true, postfastAccountId: true, handle: true } } } as const
export const fingerprint = (b: unknown) => createHash('sha256').update(JSON.stringify(b)).digest('hex')
export async function queueGoogleBrandImport(brandId: string, force = false, database: any = prisma) {
  const b = await database.brand.findUnique({ where: { id: brandId }, select: configSelect })
  if (!b) return
  const configHash = fingerprint(b)
  const old = await database.googleBrandImport.findUnique({ where: { brandId } })
  if (old?.configHash === configHash && !force) return old
  if (!old && !b.googleRefreshToken && !b.accounts.some((a: any) => /^(google|google_business|gbp)$/.test(a.platformId))) return
  return database.googleBrandImport.upsert({ where: { brandId }, create: { brandId, configHash }, update: {
    configHash, generation: { increment: 1 }, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, lastError: null, result: null,
  } })
}
