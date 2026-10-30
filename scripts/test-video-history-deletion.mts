import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'

const db = new PGlite()
await db.exec(`CREATE TABLE "VideoProductionJob" (id text primary key,"brandId" text,"createdBy" text,status text,plan jsonb,data jsonb default '{}');`)
const migration = readFileSync('prisma/migrations/20261030090000_video_history_deletion/migration.sql', 'utf8')
await db.exec(migration); await db.exec(migration)
let allowed = true, active = true, afterLock: (() => Promise<void>) | undefined
function model(sql: any) {
  return {
    findUnique: async ({ where }: any) => {
      const row = (await sql.query('select * from "VideoProductionJob" where id=$1', [where.id])).rows[0] as any
      return row ? { ...row.data, ...row, data: undefined } : null
    },
    updateMany: async ({ where, data }: any) => sql.query('update "VideoProductionJob" set "historyDeletedAt"=$1 where id=any($2::text[]) and "brandId"=$3 and "createdBy"=$4 and "historyDeletedAt" is null', [data.historyDeletedAt, where.id.in, where.brandId, where.createdBy]),
    update: async ({ where, data }: any) => {
      await sql.query('update "VideoProductionJob" set data=data||$2::jsonb,status=$3,plan=$4 where id=$1', [where.id, JSON.stringify(data), data.status, JSON.stringify(data.plan)])
      return model(sql).findUnique({ where })
    },
  }
}
const prisma: any = {
  videoProductionJob: model(db),
  $queryRawUnsafe: async (query: string) => (await db.query(query)).rows,
  user: { findUnique: async () => ({ id: 'actor', status: active ? 'ACTIVE' : 'DISABLED', type: 'HUMAN' }) },
  $transaction: (work: any) => db.transaction(async sql => work({ videoProductionJob: model(sql), $executeRawUnsafe: (query: string) => sql.exec(query), $queryRaw: async () => { const pause = afterLock; afterLock = undefined; if (pause) await pause(); return [] } })),
}
const compile = (file: string, deps: Record<string, unknown>) => {
  const mod = { exports: {} as any }
  const code = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  new Function('require', 'module', 'exports', code)((name: string) => { assert(name in deps, name); return deps[name] }, mod, mod.exports)
  return mod.exports
}
const access = compile('src/lib/videoJobAccess.ts', { './prisma': { prisma }, './user-management/brandAccess': { canUserAccessBrand: async () => allowed } })
const schema = compile('src/lib/videoHistorySchema.ts', { './prisma': { prisma } })
await db.exec('ALTER TABLE "VideoProductionJob" DROP COLUMN "historyDeletedAt"')
await schema.ensureVideoHistorySchema(); await schema.ensureVideoHistorySchema()
const role = { requireActorPermission: async () => { if (!allowed) throw Object.assign(Error('Denied'), { status: 404 }) } }
const deletion = compile('src/lib/videoJobDeletion.ts', { './prisma': { prisma }, './videoJobAccess': access, './role-permissions/delegation': role })
const persistence = compile('src/lib/videoJobPersistence.ts', {
  './prisma': { prisma }, './brandAccess': { canSessionAccessBrandProject: async () => allowed }, './user-management/brandAccess': { canUserAccessBrand: async () => allowed },
  './role-permissions/delegation': role, './videoLineage': {}, './videoReceipt': {},
})
const add = async (id: string, links: string[] = [], owner = 'actor', brand = 'brand') => db.query('insert into "VideoProductionJob"(id,"brandId","createdBy",status,plan,data) values($1,$2,$3,\'generating\',$4,$5)', [id, brand, owner, JSON.stringify(links.length ? { _mmVideoJob: { editor: { languageJobs: links.map(id => ({ id })) } } } : {}), JSON.stringify({ finalVideoUrl: '/retained.mp4', mediaUrls: ['/retained.jpg'] })])
await add('root', ['en']); await add('en', ['root']); await add('single')
assert.deepEqual((await deletion.videoHistoryDeletionContext('actor', 'brand', 'en')).map((r: any) => r.id), ['en', 'root'])
await assert.rejects(deletion.deleteVideoHistory('actor', 'brand', 'root', ['root']), (e: any) => e.status === 409)
await deletion.deleteVideoHistory('actor', 'brand', 'root', ['root', 'en'])
assert((await prisma.videoProductionJob.findUnique({ where: { id: 'root' } })).historyDeletedAt)
assert.equal((await prisma.videoProductionJob.findUnique({ where: { id: 'root' } })).finalVideoUrl, '/retained.mp4')
assert.deepEqual(await deletion.deleteVideoHistory('actor', 'brand', 'en', ['en', 'root']), { deletedIds: ['en', 'root'] })
// Execute the real read guard against a tombstoned row.
prisma.videoProductionJob.findFirst = prisma.videoProductionJob.findUnique
await assert.rejects(access.readTrustedVideoJob('actor', 'root', 'brand'), (e: any) => e.status === 404)
await add('bad', ['foreign']); await add('foreign', [], 'other')
await assert.rejects(deletion.deleteVideoHistory('actor', 'brand', 'bad', ['bad', 'foreign']), (e: any) => e.status === 404)
assert.equal((await prisma.videoProductionJob.findUnique({ where: { id: 'bad' } })).historyDeletedAt, null)
allowed = false; await assert.rejects(deletion.videoHistoryDeletionContext('actor', 'brand', 'single')); allowed = true
active = false; await assert.rejects(deletion.videoHistoryDeletionContext('actor', 'brand', 'single')); active = true
const actor = { id: 'actor', type: 'HUMAN' }, body = (id: string) => ({ id, brandId: 'brand', status: 'generating', scenes: [], plan: {} })
await persistence.saveVideoJob(actor, body('single'))
// Hold deletion's actual transaction open, then queue a save from another worker.
let release!: () => void, entered!: () => void
const ready = new Promise<void>(resolve => { entered = resolve }), gate = new Promise<void>(resolve => { release = resolve })
afterLock = async () => { entered(); await gate }
const deleting = deletion.deleteVideoHistory('actor', 'brand', 'single', ['single'])
await ready
const saving = persistence.saveVideoJob(actor, body('single'))
release(); await deleting
await assert.rejects(saving, (e: any) => e.status === 404)
await assert.rejects(persistence.saveVideoJob(actor, body('single')), (e: any) => e.status === 404)
assert((await prisma.videoProductionJob.findUnique({ where: { id: 'single' } })).historyDeletedAt)
// A retained library asset opens a new editable copy instead of resurrecting its deleted job.
const library = compile('src/lib/videoLibrary.ts', { './prisma': { prisma }, 'node:crypto': await import('node:crypto'), './user-management/brandAccess': { canUserAccessBrand: async () => true }, './role-permissions/delegation': role, './videoLineage': {} })
const copied = await library.resumeLibraryVideo('actor', 'brand', { assetId: 'retained-asset' }, {
  mediaAsset: { findFirst: async () => ({ technicalMetadata: { videoDraft: { jobId: 'single', editor: { brandId: 'brand', script: 'Retained script', assets: [] } } } }), findMany: async () => [] },
  videoProductionJob: { findFirst: async ({ where }: any) => (await db.query('select id from "VideoProductionJob" where id=$1 and ($2::boolean=false or "historyDeletedAt" is null)', [where.id, where.historyDeletedAt === null])).rows[0] || null },
})
assert.equal(copied.mode, 'copy'); assert.equal(copied.editor.script, 'Retained script'); assert(!copied.jobId)
await db.close()
console.log('PASS real SQL migration, atomic language-group tombstones, media retention, disabled/foreign access, repeated deletion and concurrent late-save rejection')
