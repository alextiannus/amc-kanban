import type { Prisma } from '@prisma/client'
import { configSelect, fingerprint, queueGoogleBrandImport } from './googleBrandImportQueue'
export { queueGoogleBrandImport } from './googleBrandImportQueue'
import { prisma } from './prisma'
import { getGoogleAccessToken } from './integrations/google'
import { postfastGetGBPLocationsForInternalAccount } from './integrations/postfast'
import { GoogleImportError, googleId, listOwnedGoogleLocations, mergeGoogleMenu, object, readGoogleBrandData, text } from './integrations/googleBrandData'
import { growthPathsForBrandPatch, growthPathsForKnowledgePatch, queueBrandGrowthSync, syncBrandGrowthState } from './brandGrowthSync'

async function tokenFor(b: any) {
  if (!b.googleRefreshToken) throw new GoogleImportError('GOOGLE_OAUTH_REQUIRED')
  try { return await getGoogleAccessToken(b.googleRefreshToken, { clientId: b.googleClientId, clientSecret: b.googleClientSecret }) }
  catch { throw new GoogleImportError('GOOGLE_AUTHORIZATION_FAILED') }
}
export async function ownedGoogleLocations(brandId: string) {
  const b = await prisma.brand.findUnique({ where: { id: brandId }, select: configSelect })
  if (!b) throw new GoogleImportError('BRAND_NOT_FOUND')
  if (b.googleRefreshToken) return listOwnedGoogleLocations(await tokenFor(b))
  if (!b.postfastApiKey) throw new GoogleImportError('GOOGLE_OAUTH_REQUIRED')
  const result: Array<{ id: string; accountId: string; name: string; address: string }> = []
  for (const account of b.accounts.filter((a: any) => /^(google|google_business|gbp)$/.test(a.platformId))) {
    const response = await postfastGetGBPLocationsForInternalAccount(b.postfastApiKey, account.id)
    if (!response.success) throw new GoogleImportError('GOOGLE_BOUND_ACCOUNT_READ_FAILED')
    result.push(...response.locations.map(l => ({ id: l.id, accountId: `postfast:${account.id}`, name: l.name, address: l.address || '' })))
  }
  return result
}
export async function selectGoogleLocation(brandId: string, accountId: string, locationId: string) {
  const postfast = typeof accountId === 'string' && accountId.startsWith('postfast:')
  const a = postfast ? accountId : googleId(accountId, 'accounts'), l = postfast ? text(locationId, 300) : googleId(locationId, 'locations')
  const b = await prisma.brand.findUnique({ where: { id: brandId }, select: configSelect })
  if (!b) throw new GoogleImportError('BRAND_NOT_FOUND')
  const locations = await ownedGoogleLocations(brandId)
  const chosen = locations.find(v => v.accountId === a && v.id === l)
  if (!chosen) throw new GoogleImportError('GOOGLE_LOCATION_NOT_OWNED')
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const current = await tx.brand.findUnique({ where: { id: brandId }, select: configSelect })
    if (fingerprint(current) !== fingerprint(b)) throw new GoogleImportError('GOOGLE_CONFIGURATION_CHANGED')
    await tx.brand.update({ where: { id: brandId }, data: { googleAccountId: postfast ? null : a, googleLocationId: l, googleLocationName: chosen.name } })
    await queueGoogleBrandImport(brandId, true, tx)
    await tx.googleBrandImport.update({ where: { brandId }, data: { socialAccountId: postfast ? a.slice(9) : null } })
  })
}
async function collect(b: any, selectedAccountId?: string | null) {
  if (b.status === 'ARCHIVED') throw new GoogleImportError('BRAND_ARCHIVED')
  if (b.googleRefreshToken) {
    if (!b.googleAccountId || !b.googleLocationId) throw new GoogleImportError('GOOGLE_LOCATION_SELECTION_REQUIRED')
    return readGoogleBrandData(await tokenFor(b), b.googleAccountId, b.googleLocationId)
  }
  const accounts = b.accounts.filter((a: any) => /^(google|google_business|gbp)$/.test(a.platformId) && a.postfastAccountId && (!selectedAccountId || a.id === selectedAccountId))
  if (!b.postfastApiKey || accounts.length !== 1) throw new GoogleImportError(accounts.length > 1 ? 'GOOGLE_ACCOUNT_SELECTION_REQUIRED' : 'GOOGLE_OAUTH_REQUIRED')
  const remote = await postfastGetGBPLocationsForInternalAccount(b.postfastApiKey, accounts[0].id)
  if (!remote.success) throw new GoogleImportError('GOOGLE_BOUND_ACCOUNT_READ_FAILED')
  // Only a sole location or an explicit configured location can identify this brand.
  const selected = b.googleLocationId ? remote.locations.find(l => l.id === b.googleLocationId || l.id === `locations/${b.googleLocationId}`) : remote.locations.length === 1 ? remote.locations[0] : null
  if (!selected) throw new GoogleImportError('GOOGLE_LOCATION_SELECTION_REQUIRED')
  return { source: 'postfast_google_binding', resource: selected.id, observedAt: new Date().toISOString(),
    profile: { name: selected.name, googleLocationName: selected.name, address: selected.address || '', googlePlaceId: selected.placeId || '', googleBusinessUrl: /^https:\/\//.test(selected.mapsUri || '') ? selected.mapsUri : '' },
    menu: [], reviewSummary: null, missing: ['GOOGLE_OAUTH_REQUIRED_FOR_MENU_AND_REVIEWS'] }
}

export async function runGoogleBrandImport(brandId?: string) {
  const now = new Date()
  const row = await prisma.googleBrandImport.findFirst({ where: { ...(brandId ? { brandId } : {}), OR: [
    { status: 'PENDING', nextAttemptAt: { lte: now } }, { status: 'RUNNING', leaseUntil: { lt: now } },
  ] }, orderBy: { nextAttemptAt: 'asc' } })
  if (!row) return null
  const lease = new Date(Date.now() + 10 * 60_000)
  const claimed = await prisma.googleBrandImport.updateMany({ where: { brandId: row.brandId, generation: row.generation, status: row.status, leaseUntil: row.leaseUntil }, data: { status: 'RUNNING', leaseUntil: lease, attempts: { increment: 1 } } })
  if (!claimed.count) return null
  try {
    const b = await prisma.brand.findUnique({ where: { id: row.brandId }, select: configSelect })
    if (!b || fingerprint(b) !== row.configHash) { await queueGoogleBrandImport(row.brandId); return null }
    const data = await collect(b, row.socialAccountId)
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Serialize final merge against other import workers. Re-read all human data.
      await tx.$queryRaw`SELECT "id" FROM "Brand" WHERE "id" = ${row.brandId} FOR UPDATE`
      await tx.brandKnowledge.upsert({ where: { brandId: row.brandId }, create: { brandId: row.brandId, negPrompts: [] }, update: {} })
      await tx.$queryRaw`SELECT "id" FROM "BrandKnowledge" WHERE "brandId" = ${row.brandId} FOR UPDATE`
      const current = await tx.brand.findUnique({ where: { id: row.brandId }, include: { knowledge: true } })
      const config = await tx.brand.findUnique({ where: { id: row.brandId }, select: configSelect })
      const receipt = await tx.googleBrandImport.findUnique({ where: { brandId: row.brandId } })
      if (!current || !receipt || receipt.generation !== row.generation || receipt.leaseUntil?.getTime() !== lease.getTime() || fingerprint(config) !== row.configHash) throw new GoogleImportError('GOOGLE_CONFIGURATION_CHANGED')
      const profile = object(data.profile), patch: Record<string, string> = {}
      for (const key of ['address', 'phone', 'website', 'description', 'googlePlaceId', 'googleLocationName', 'googleBusinessUrl'] as const) {
        if (!text(current[key]) && text(profile[key])) patch[key] = text(profile[key])
      }
      const merged = mergeGoogleMenu(current.knowledge?.menuItems, data.menu)
      const knowledgePatch: Record<string, any> = {}
      if (merged.added) knowledgePatch.menuItems = merged.items
      if (!current.knowledge?.businessHours && text(profile.businessHours)) knowledgePatch.businessHours = text(profile.businessHours)
      if (Object.keys(patch).length) await tx.brand.update({ where: { id: row.brandId }, data: patch })
      if (Object.keys(knowledgePatch).length) await tx.brandKnowledge.upsert({ where: { brandId: row.brandId }, create: { brandId: row.brandId, negPrompts: [], ...knowledgePatch }, update: knowledgePatch })
      const dirtyPaths = [...growthPathsForBrandPatch(patch), ...growthPathsForKnowledgePatch(knowledgePatch), ...(data.reviewSummary ? ['merchant.googleReviewSummary'] : [])]
      if (dirtyPaths.length) await queueBrandGrowthSync({ brandId: row.brandId, dirtyPaths, actor: { type: 'SYSTEM' }, tx })
      const saved = { source: data.source, resource: data.resource, observedAt: data.observedAt, fieldsAdded: [...Object.keys(patch), ...Object.keys(knowledgePatch)], skuAdded: merged.added, skuCount: merged.items.length, skuNames: merged.items.map(i => text(i.name)).filter(Boolean), reviewSummary: data.reviewSummary, missing: data.missing }
      await tx.auditLog.create({ data: { actorType: 'SYSTEM', action: 'GOOGLE_BRAND_ENRICHED', resourceType: 'Brand', resourceId: row.brandId, metadata: { source: data.source, resource: data.resource, observedAt: data.observedAt, fieldsAdded: saved.fieldsAdded, skuAdded: merged.added } } })
      return tx.googleBrandImport.update({ where: { brandId: row.brandId }, data: { status: data.missing.length ? 'PARTIAL' : 'COMPLETE', result: saved as any, leaseUntil: null, lastError: null } })
    })
    await syncBrandGrowthState(row.brandId).catch(() => undefined)
    return result
  } catch (error) {
    const code = error instanceof GoogleImportError ? error.code : 'GOOGLE_IMPORT_FAILED'
    if (code === 'GOOGLE_CONFIGURATION_CHANGED') { await queueGoogleBrandImport(row.brandId, true); return null }
    const blocked = /REQUIRED|SELECTION|ARCHIVED|NOT_OWNED/.test(code)
    await prisma.googleBrandImport.updateMany({ where: { brandId: row.brandId, generation: row.generation, leaseUntil: lease }, data: { status: blocked || row.attempts >= 4 ? 'NEEDS_ATTENTION' : 'PENDING', leaseUntil: null, lastError: code, nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** row.attempts) * 60_000) } })
    return null
  }
}
const state = globalThis as typeof globalThis & { googleImportTimer?: ReturnType<typeof setInterval>; googleImportBusy?: boolean }
export function startGoogleBrandImportWorker() {
  if (state.googleImportTimer) return
  const tick = async () => {
    if (state.googleImportBusy) return
    state.googleImportBusy = true
    try { await runGoogleBrandImport() } catch { console.warn('[google-brand-import] worker unavailable') }
    finally { state.googleImportBusy = false }
  }
  state.googleImportTimer = setInterval(() => { void tick() }, 15_000)
  state.googleImportTimer.unref()
  void tick()
}
