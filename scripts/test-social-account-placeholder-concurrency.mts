import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { resolveDraftPlatformAccount, reconcilePlaceholderAccounts } from '../src/lib/socialAccountPlaceholder.ts'
import { lockBrandSync, lockAccountBinding } from '../src/lib/socialAccountLocks.ts'

const url = new URL(process.env.DATABASE_URL || '')
assert(['localhost', '127.0.0.1'].includes(url.hostname) && url.pathname.startsWith('/amc_lineage_test_'), 'An isolated local test database is required')
url.searchParams.set('connection_limit', '2')
const clients = [0, 1].map(() => new PrismaClient({ datasources: { db: { url: url.toString() } } }))
const [first, second] = clients
const brandId = `placeholder-concurrency-${randomUUID()}`
const realId = `real-${randomUUID()}`
let release: (() => void) | undefined
let heldWork: Promise<unknown> | undefined
const deferred = () => {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
try {
  await first.brand.create({ data: { id: brandId, name: 'Isolated placeholder concurrency fixture' } })
  const saved = await Promise.all(Array.from({ length: 8 }, (_, index) => clients[index % 2].$transaction(async tx => {
    const account = await resolveDraftPlatformAccount(tx, brandId, index % 2 ? 'fb' : 'facebook')
    return tx.contentDraft.create({ data: { brandId, accountId: account.id, caption: `Keep fixture ${index}` } })
  }, { maxWait: 15_000, timeout: 15_000 })))
  const sourceId = saved[0].accountId!
  assert.equal(new Set(saved.map(row => row.accountId)).size, 1)
  assert.equal(await first.socialAccount.count({ where: { brandId } }), 1)
  assert.equal((await first.socialAccount.findUniqueOrThrow({ where: { id: sourceId } })).autoPilot, false)
  await first.socialAccount.create({ data: { id: realId, brandId, platformId: 'facebook', handle: 'fixture-real', postfastAccountId: `provider-${brandId}`, connectionStatus: 'CONNECTED' } })

  const ready = deferred(), finish = deferred()
  release = finish.resolve
  heldWork = first.$transaction(async tx => {
    await lockBrandSync(tx, brandId)
    ready.resolve()
    await finish.promise
    return reconcilePlaceholderAccounts(tx, brandId)
  }, { timeout: 15_000 })
  await ready.promise
  const concurrentSave = second.$transaction(async tx => {
    const account = await resolveDraftPlatformAccount(tx, brandId, 'facebook')
    return tx.contentDraft.create({ data: { brandId, accountId: account.id, caption: 'Saved while synchronization held the brand lock' } })
  }, { maxWait: 15_000, timeout: 15_000 })
  finish.resolve()
  const [, newDraft] = await Promise.all([heldWork, concurrentSave])
  heldWork = undefined; release = undefined
  assert.equal(newDraft.accountId, realId)
  assert.equal(await first.socialAccount.count({ where: { id: sourceId } }), 0)
  for (const original of saved) {
    const persisted = await first.contentDraft.findUniqueOrThrow({ where: { id: original.id } })
    assert.equal(persisted.accountId, realId)
    assert.equal(persisted.caption, original.caption)
  }

  const protectedAccount = await first.$transaction(tx => resolveDraftPlatformAccount(tx, brandId, 'facebook', false))
  const protectedDraft = await first.contentDraft.create({ data: { brandId, accountId: protectedAccount.id, caption: 'Concurrent publishing fixture' } })
  const publishingReady = deferred(), publishingFinish = deferred()
  release = publishingFinish.resolve
  heldWork = second.$transaction(async tx => {
    await lockAccountBinding(tx, protectedAccount.id)
    await tx.contentDraft.update({ where: { id: protectedDraft.id }, data: { status: 'publishing' } })
    publishingReady.resolve()
    await publishingFinish.promise
  }, { timeout: 15_000 })
  await publishingReady.promise
  await assert.rejects(() => first.$transaction(tx => reconcilePlaceholderAccounts(tx, brandId)), (error: any) => error.code === 'ACCOUNT_BUSY')
  publishingFinish.resolve(); await heldWork; heldWork = undefined; release = undefined
  await first.$transaction(tx => reconcilePlaceholderAccounts(tx, brandId))
  assert.equal((await first.contentDraft.findUniqueOrThrow({ where: { id: protectedDraft.id } })).accountId, protectedAccount.id)
  assert.equal((await first.contentDraft.findUniqueOrThrow({ where: { id: protectedDraft.id } })).status, 'publishing')

  await first.contentDraft.update({ where: { id: protectedDraft.id }, data: { status: 'draft' } })
  const editReady = deferred(), editFinish = deferred()
  release = editFinish.resolve
  heldWork = second.$transaction(async tx => {
    await tx.contentDraft.update({ where: { id: protectedDraft.id }, data: { scheduledAt: new Date('2030-01-01'), caption: 'New concurrent edit retained' } })
    editReady.resolve(); await editFinish.promise
  }, { timeout: 15_000 })
  await editReady.promise
  const waitingReconcile = first.$transaction(tx => reconcilePlaceholderAccounts(tx, brandId), { timeout: 15_000 })
  editFinish.resolve(); await Promise.all([heldWork, waitingReconcile]); heldWork = undefined; release = undefined
  const edited = await first.contentDraft.findUniqueOrThrow({ where: { id: protectedDraft.id } })
  assert.equal(edited.accountId, protectedAccount.id)
  assert.equal(edited.caption, 'New concurrent edit retained')
  assert(edited.scheduledAt)
  console.log('PASS real PostgreSQL multi-connection tests: eight concurrent alias saves, sync/create serialization, publication/account mutual exclusion and locked draft edit revalidation')
} finally {
  release?.()
  await heldWork?.catch(() => {})
  await first.auditLog.deleteMany({ where: { metadata: { path: ['brandId'], equals: brandId } } })
  await first.brand.deleteMany({ where: { id: brandId } })
  await Promise.all(clients.map(client => client.$disconnect()))
}
