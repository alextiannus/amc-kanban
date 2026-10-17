import { createHash } from 'node:crypto'
import { prisma } from './prisma.ts'
import { accountPlatform } from './socialAccountIdentity'

export const configSelect = { id: true, status: true, googleRefreshToken: true, googleClientId: true, googleClientSecret: true, googleAccountId: true, googleLocationId: true, postfastApiKey: true,
  accounts: { where: { unboundAt: null }, orderBy: { id: 'asc' }, select: { id: true, platformId: true, postfastAccountId: true, handle: true } } } as const
export const fingerprint = (b: unknown) => createHash('sha256').update(JSON.stringify(b)).digest('hex')
export async function queueGoogleBrandImport(brandId: string, force = false, database: any = prisma) {
  const b = await database.brand.findUnique({ where: { id: brandId }, select: configSelect })
  if (!b) return
  const configHash = fingerprint(b)
  const old = await database.googleBrandImport.findUnique({ where: { brandId } })
  if (old?.configHash === configHash && !force) return old
  if (!old && !b.googleRefreshToken && !b.accounts.some((a: any) => accountPlatform(a.platformId) === 'google')) return
  return database.googleBrandImport.upsert({ where: { brandId }, create: { brandId, configHash }, update: {
    configHash, generation: { increment: 1 }, status: 'PENDING', attempts: 0, nextAttemptAt: new Date(), leaseUntil: null, lastError: null, result: null,
  } })
}

/** Backfill only missing receipts, in bounded batches. Existing human selections stay untouched. */
export async function queueMissingGoogleBrandImports() {
  const brands = await prisma.brand.findMany({
    where: {
      status: { not: 'ARCHIVED' }, googleBrandImport: { is: null },
      OR: [
        { googleRefreshToken: { not: null } },
        { accounts: { some: { unboundAt: null, handle: { not: 'unconfigured' }, platformId: { in: ['google', 'google_business', 'google_maps', 'google_business_profile', 'gbp', 'gmb', 'GOOGLE', 'GOOGLE_BUSINESS_PROFILE', 'GBP'] } } } },
      ],
    }, select: { id: true }, orderBy: { id: 'asc' }, take: 25,
  })
  for (const brand of brands) await queueGoogleBrandImport(brand.id)
  return brands.length
}
