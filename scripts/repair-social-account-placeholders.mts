import { disablePlaceholderAutopilot, draftPlatform, reconcilePlaceholderAccounts } from '../src/lib/socialAccountPlaceholder.ts'
import { lockBrandSync } from '../src/lib/socialAccountLocks.ts'
import { postfastFetchAccounts } from '../src/lib/integrations/postfast.ts'

const args = process.argv.slice(2)
const brandIndex = args.indexOf('--brand-id')
const brandId = brandIndex >= 0 ? args[brandIndex + 1] : ''
const all = args.includes('--all')
const apply = args.includes('--apply')
const allowed = new Set(['--brand-id', '--all', '--apply', '--dry-run', brandId])
if ((all ? brandIndex >= 0 : !brandId || brandId.startsWith('--')) || args.some(arg => !allowed.has(arg)) || (apply && args.includes('--dry-run'))) {
  console.error('Usage: node --import tsx scripts/repair-social-account-placeholders.mts (--brand-id <id> | --all) [--dry-run | --apply]')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('Configure DATABASE_URL in the environment. Never put credentials in arguments or output.')
  process.exit(1)
}
const { prisma } = await import('../src/lib/prisma.ts')
try {
  const brands = await prisma.brand.findMany({
    where: all ? { accounts: { some: { handle: 'unconfigured' } } } : { id: brandId },
    select: { id: true, name: true, status: true, postfastApiKey: true }, orderBy: { id: 'asc' },
  })
  if (!all && !brands.length) throw new Error('Brand not found')
  let failures = 0
  for (const config of brands) {
    try {
      const remote = config.status !== 'ARCHIVED' && config.postfastApiKey
        ? await postfastFetchAccounts(config.postfastApiKey, 10_000) : null
      const providerState = config.status === 'ARCHIVED' ? 'archived'
        : !config.postfastApiKey ? 'not_configured' : remote?.success ? 'verified' : 'unavailable'
      const reconcile = providerState === 'verified'
      // Invalid or duplicate provider identities fail closed, even after HTTP success.
      if (remote?.success && (remote.accounts.some(a => !a.id || !a.platformId || !a.handle) || new Set(remote.accounts.map(a => a.id)).size !== remote.accounts.length)) {
        throw new Error('Invalid provider identity')
      }
      const report = await prisma.$transaction(async (tx: any) => {
        if (!apply) await tx.$executeRaw`SET TRANSACTION READ ONLY`
        await lockBrandSync(tx, config.id)
        const brand = await tx.brand.findUnique({ where: { id: config.id }, select: { id: true, name: true, status: true, postfastApiKey: true } })
        if (!brand || brand.postfastApiKey !== config.postfastApiKey || brand.status !== config.status) throw new Error('Brand configuration changed')
        const placeholders = await tx.socialAccount.findMany({ where: { brandId: config.id, handle: 'unconfigured', autoPilot: true }, select: { id: true } })
        const disabledAccountIds = reconcile ? placeholders.map((a: { id: string }) => a.id)
          : await disablePlaceholderAutopilot(tx, config.id, apply, providerState)
        // Require the live stable ID and platform to agree with the local target.
        const locals = reconcile ? await tx.socialAccount.findMany({ where: { brandId: config.id } }) : []
        const healthyIds = new Set<string>((remote?.accounts || []).filter(remoteAccount =>
          remoteAccount.connectionStatus === 'CONNECTED' && !remoteAccount.disabledReason &&
          locals.some((local: { postfastAccountId: string | null; platformId: string }) => local.postfastAccountId === remoteAccount.id && draftPlatform(local.platformId) === draftPlatform(remoteAccount.platformId))
        ).map(a => a.id))
        const entries = reconcile ? await reconcilePlaceholderAccounts(tx, config.id, apply, healthyIds) : []
        return {
          brand: { id: brand.id, name: brand.name, status: brand.status }, mode: apply ? 'apply' : 'dry-run',
          providerState, operation: reconcile ? 'reconcile' : 'disable_only', disabledAccountIds, entries,
          migratedDrafts: entries.reduce((n, row) => n + row.migratedDraftIds.length, 0),
          deletedPlaceholders: entries.filter(row => row.deleted).length, publish: false,
        }
      }, { timeout: 60_000, isolationLevel: 'RepeatableRead' })
      console.log(JSON.stringify(report))
    } catch (error) {
      failures++
      // Never serialize Prisma or provider errors: they may contain credentials.
      console.error(JSON.stringify({ failed: true, mode: apply ? 'apply' : 'dry-run', brandId: config.id, code: (error as { code?: string }).code || 'RECONCILIATION_FAILED' }))
    }
  }
  if (failures) process.exitCode = 1
} catch {
  console.error(JSON.stringify({ failed: true, code: 'MAINTENANCE_FAILED' }))
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
