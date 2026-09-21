import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { monthWindow, selectSubscription, subscriptionState, canReadOperations } from '../src/lib/brand-operations/policy.ts'
import { canAccessView, getMenuGroups } from '../src/lib/permissions.ts'
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test'
const { changePrincipal, assignmentVersion, listOperations } = await import('../src/lib/brand-operations/service.ts')

const now = new Date('2026-09-20T10:00:00Z')
assert.equal(monthWindow(now).start.toISOString(), '2026-08-31T16:00:00.000Z')
assert.equal(monthWindow(new Date('2026-09-30T16:00:00Z')).start.toISOString(), '2026-09-30T16:00:00.000Z')
assert.equal(monthWindow(new Date('2026-12-31T16:00:00Z')).start.toISOString(), '2026-12-31T16:00:00.000Z')
const sub = (id: string, status = 'ACTIVE', createdAt = '2026-08-01', end: string | null = '2026-10-01') => ({ id, status, createdAt, planName: 'Essential', feeWaived: false, contractStartDate: '2026-08-01', contractEndDate: end })
assert.equal(selectSubscription([sub('active'), sub('renewal', 'PENDING', '2026-09-19')], now).id, 'active')
assert.equal(subscriptionState(sub('expired', 'ACTIVE', '2026-01-01', now.toISOString()), now), 'EXPIRED')
assert.equal(subscriptionState({ ...sub('future'), contractStartDate: '2026-10-01', contractEndDate: '2027-01-01' }, now), 'UPCOMING')
for (const roles of [['ADMIN'], ['AMC_PRINCIPAL'], ['BRAND_OWNER'], ['BD'], ['RESEARCHER'], []]) {
  for (const grants of [[], ['brand.read'], ['analytics.read'], ['brand.read', 'analytics.read']]) {
    const allowed = roles.includes('ADMIN') || roles.includes('AMC_PRINCIPAL') && grants.length === 2
    assert.equal(canReadOperations(roles, grants), allowed)
    assert.equal(canAccessView(roles as any, 'managementOverview', grants), allowed)
    assert.equal(getMenuGroups(roles as any, grants).flatMap(g => g.items).some(i => i.id === 'managementOverview'), allowed)
  }
}

// Actual PostgreSQL transaction semantics test the assignment + audit rollback.
const pg = new PGlite()
await pg.exec(`
CREATE TABLE users (id text PRIMARY KEY, status text, eligible boolean, type text DEFAULT 'HUMAN');
CREATE TABLE brands (id text PRIMARY KEY, status text, subscribed boolean);
CREATE TABLE crews (id text PRIMARY KEY, "brandId" text UNIQUE);
CREATE TABLE members (id text PRIMARY KEY, "crewId" text, "userId" text, role text, active boolean, "updatedAt" timestamptz DEFAULT now(), UNIQUE("crewId", "userId"));
CREATE TABLE audit (data jsonb);
INSERT INTO users (id,status,eligible) VALUES ('owner','ACTIVE',true),('old','ACTIVE',true),('next','ACTIVE',true),('disabled','DISABLED',true),('invalid','ACTIVE',false),('editor','ACTIVE',false),('bot','ACTIVE',true);
UPDATE users SET type='AI_AGENT' WHERE id='bot';
INSERT INTO brands VALUES ('brand','ACTIVE',true),('none','ACTIVE',false),('archive','ARCHIVED',true);
INSERT INTO crews VALUES ('crew','brand');
INSERT INTO members (id,"crewId","userId",role,active) VALUES ('m1','crew','owner','OWNER',true),('m2','crew','old','PRINCIPAL',true),('m3','crew','editor','EDITOR',true),('m4','crew','viewer','VIEWER',true);
`)
let failAudit = false
function adapter(sql: any): any {
  const one = async (q: string, args: any[]) => (await sql.query(q, args)).rows[0] || null
  return {
    brand: { findFirst: async ({where}: any) => {
      const b = await one('SELECT * FROM brands WHERE id=$1 AND status<>$2' + (where.subscriptions ? ' AND subscribed=true' : ''), [where.id, where.status.not])
      if (!b) return null
      b.crew = await one('SELECT * FROM crews WHERE "brandId"=$1', [b.id])
      if (b.crew) b.crew.members = (await sql.query('SELECT * FROM members WHERE "crewId"=$1', [b.crew.id])).rows
      return b
    } },
    user: { findFirst: ({where}: any) => one('SELECT id FROM users WHERE id=$1 AND status=$2 AND type=$3' + (where.businessRoles ? ' AND eligible=true' : ''), [where.id, where.status, where.type]) },
    marketingCrew: { create: ({data}: any) => one('INSERT INTO crews VALUES ($1,$2) RETURNING *', ['crew-'+data.brandId, data.brandId]) },
    crewMember: {
      updateMany: async ({where}: any) => sql.query(`UPDATE members SET role='EDITOR',"updatedAt"=now() WHERE "crewId"=$1 AND active=true AND role=$2 AND "userId"<>$3`, [where.crewId, where.role, where.userId.not]),
      upsert: ({create: d}: any) => one('INSERT INTO members (id,"crewId","userId",role,active) VALUES ($1,$2,$3,$4,true) ON CONFLICT ("crewId","userId") DO UPDATE SET role=EXCLUDED.role,active=true,"updatedAt"=now() RETURNING *', ['m-'+d.userId,d.crewId,d.userId,d.role]),
    },
    auditLog: { create: async ({data}: any) => { if (failAudit) throw new Error('audit unavailable'); await sql.query('INSERT INTO audit VALUES ($1)', [JSON.stringify(data)]) } },
  }
}
const db: any = { ...adapter(pg), $transaction: (fn: any, opts: any) => { assert.equal(opts.isolationLevel, 'Serializable'); return pg.transaction(sql => fn(adapter(sql))) } }
const admin: any = { userId: 'admin', email: 'admin@example.test', globalRoles: ['ADMIN'], actorType: 'HUMAN', source: 'session', authVersion: 1 }
const memberRows = async () => (await pg.query('SELECT * FROM members ORDER BY id')).rows as any[]
try {
  const before = await memberRows()
  const version = assignmentVersion(before)
  const input = { principalId: 'next', expectedVersion: version }
  for (const actor of [{...admin,globalRoles:['AMC_PRINCIPAL']},{...admin,source:'api_key'}]) await assert.rejects(changePrincipal(actor,'brand',input,db), /Forbidden/)
  for (const id of ['none','archive','missing']) await assert.rejects(changePrincipal(admin,id,input,db), /不存在或没有订阅/)
  for (const id of ['disabled','invalid','missing']) await assert.rejects(changePrincipal(admin,'brand',{...input,principalId:id},db), /不是可指派/)
  await assert.rejects(changePrincipal(admin,'brand',{...input,principalId:'owner'},db), /品牌主/)
  await assert.rejects(changePrincipal(admin,'brand',{...input,expectedVersion:'stale'},db), /已变更/)
  await assert.rejects(changePrincipal(admin,'brand',null,db), /请选择/)
  failAudit = true
  await assert.rejects(changePrincipal(admin,'brand',input,db), /audit unavailable/)
  assert.deepEqual(await memberRows(), before, 'all membership writes roll back with failed audit')
  failAudit = false
  await changePrincipal(admin,'brand',input,db)
  const after = await memberRows()
  assert.equal(after.find(m=>m.userId==='old').active, true)
  assert.equal(after.find(m=>m.userId==='old').role, 'EDITOR')
  assert.equal(after.find(m=>m.userId==='next').role, 'PRINCIPAL')
  assert.deepEqual(after.filter(m=>['owner','editor','viewer'].includes(m.userId)), before.filter(m=>['owner','editor','viewer'].includes(m.userId)))
  assert.equal((await pg.query('SELECT * FROM audit')).rows.length, 1)
  await assert.rejects(changePrincipal(admin,'brand',input,db), /已变更/, 'second writer must refresh rather than overwrite')
  // Admin team assignment accepts an active human editor without a global principal role.
  const teamInput = { principalId: 'editor', expectedVersion: assignmentVersion(await memberRows()) }
  await changePrincipal(admin,'brand',teamInput,db,true)
  assert.equal((await memberRows()).find(m=>m.userId==='editor').role,'PRINCIPAL')
  const latestVersion = assignmentVersion(await memberRows())
  await assert.rejects(changePrincipal(admin,'brand',{principalId:'invalid',expectedVersion:latestVersion},db,true), /先将该成员加入/)
  await pg.query(`INSERT INTO members (id,"crewId","userId",role,active) VALUES ('mb','crew','bot','EDITOR',true),('md','crew','disabled','EDITOR',true)`)
  const versionWithInvalid = assignmentVersion(await memberRows())
  for (const principalId of ['bot','disabled']) await assert.rejects(changePrincipal(admin,'brand',{principalId,expectedVersion:versionWithInvalid},db,true), /不是可指派/)
  await pg.query(`UPDATE brands SET subscribed=false WHERE id='brand'`)
  await changePrincipal(admin,'brand',{principalId:'old',expectedVersion:versionWithInvalid},db,true)
  assert.equal((await memberRows()).find(m=>m.userId==='old').role,'PRINCIPAL')
} finally { await pg.close() }

// Exercise the production read pipeline with bounded query fixtures, including
// timezone edges, pending renewals, brand scope, pagination and payload minimization.
const person = (id: string) => ({ id, nickname: id, email: id+'@example.test' })
const fixtures = Array.from({length: 28}, (_, i) => ({ id: 'b'+String(i).padStart(2,'0'), name: 'Brand '+i, location: 'Singapore', status: i===27?'ARCHIVED':'ACTIVE', subscriptions: i===26?[]:[sub('s'+i)], crew: { members: [{id:'m'+i,userId:'p',role:'PRINCIPAL',active:true,updatedAt:now,user:person('p')}] } }))
fixtures[0].subscriptions.push({ ...sub('renewal','PENDING','2026-09-19'), feeWaived: true })
fixtures[1].subscriptions.push({ ...sub('old-free','ACTIVE','2026-01-01','2026-07-01'), feeWaived: true })
for (const [id, subscriptions] of [
  ['waived-only', [{ ...sub('free'), feeWaived: true }]],
  ['waived-current', [sub('old-paid','ACTIVE','2026-01-01','2026-07-01'), { ...sub('current-free'), feeWaived: true }, sub('paid-renewal','PENDING','2026-09-19')]],
  ['waived-latest', [sub('expired-paid','ACTIVE','2026-01-01','2026-07-01'), { ...sub('latest-free','CANCELLED','2026-09-01'), feeWaived: true }]],
] as const) fixtures.push({ ...fixtures[0], id, name: id, subscriptions: [...subscriptions], crew: { members: [{ ...fixtures[0].crew.members[0], user: person('waived-principal') }] } })
const drafts = [
  ['b00','published','2026-08-31T15:59:59Z'], ['b00','published','2026-08-31T16:00:00Z'],
  ['b00','published',now.toISOString()], ['b00','published','2026-10-01T00:00:00Z'],
  ['b00','failed','2026-09-10T00:00:00Z'], ['b00','scheduled','2026-09-10T00:00:00Z'],
  ['b01','published','2026-09-10T00:00:00Z'],
  ['waived-current','published','2026-09-10T00:00:00Z'],
]
const readDb: any = {
  user: { findMany: async ({select}: any) => select.crewMemberships ? [{crewMemberships:[{crew:{brandId:'b00'}}],organizationsJoined:[{owner:{crewMemberships:[{crew:{brandId:'b01'}}]}}]}] : [person('p')] },
  brand: { findMany: async ({where, select}: any) => {
    assert.equal(select.postfastApiKey, undefined)
    assert.equal(where.subscriptions.some.constructor, Object)
    return fixtures.filter(b=>b.status!==where.status.not && b.subscriptions.length && (!where.id || where.id.in.includes(b.id)))
  } },
  contentDraft: { groupBy: async ({where,_count}: any) => {
    const filtered = drafts.filter(([brandId,status,date])=>where.brandId.in.includes(brandId) && where.status===status && new Date(date)<=where.publishedAt.lte && (!where.publishedAt.gte || new Date(date)>=where.publishedAt.gte))
    return [...new Set(filtered.map(d=>d[0]))].map(brandId => ({brandId,...(_count ? {_count:{_all:filtered.filter(d=>d[0]===brandId).length}} : {_max:{publishedAt:new Date(filtered.filter(d=>d[0]===brandId).map(d=>d[2]).sort().at(-1)!)}})}))
  } },
}
const result = await listOperations(admin,new URLSearchParams(),readDb,now)
assert.equal(result.total,26); assert.equal(result.rows.length,25)
assert.equal(result.rows[0].monthlyPublished,2); assert.equal(result.rows[0].subscription.id,'s0')
assert.equal(result.summary.monthlyPublished,3)
assert.equal(result.summary.brands,26)
assert.equal(result.summary.active,26)
assert.equal(result.summary.expiring,26)
assert(!result.principalOptions.some(p => p.id === 'waived-principal'))
assert.equal((await listOperations(admin,new URLSearchParams('q=waived'),readDb,now)).total,0)
assert.equal((await listOperations(admin,new URLSearchParams('page=2'),readDb,now)).rows.length,1)
assert.equal((await listOperations(admin,new URLSearchParams('q=Brand%2025'),readDb,now)).total,1)
assert.equal((await listOperations(admin,new URLSearchParams('status=PENDING'),readDb,now)).total,0)
assert.equal((await listOperations(admin,new URLSearchParams('principalId=unassigned'),readDb,now)).total,0)
const scoped = await listOperations({...admin,userId:'p',globalRoles:['AMC_PRINCIPAL']},new URLSearchParams(),readDb,now)
assert.deepEqual(scoped.rows.map(r=>r.id),['b00','b01'])
assert.deepEqual(scoped.candidates,[]); assert.equal(scoped.rows[0].assignmentVersion,undefined)
console.log('Brand operations: month boundaries, menus, scoped reads, subscription selection, pagination, admin-only assignment, OWNER protection, stale writes and PostgreSQL rollback passed')

const { fetchOperationsJson, OperationsRequestError } = await import('../src/lib/brand-operations/client.ts')
const originalFetch = globalThis.fetch
try {
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })) as typeof fetch
  await assert.rejects(fetchOperationsJson('/test', {}, { timeoutMs: 5 }), (e: unknown) => e instanceof OperationsRequestError && /超时/.test(e.message) && !e.refreshBeforeWrite)
  await assert.rejects(fetchOperationsJson('/test', { method: 'PATCH' }, { timeoutMs: 5 }), (e: unknown) => e instanceof OperationsRequestError && e.refreshBeforeWrite)
  globalThis.fetch = (async () => Response.json({error:'stale'}, {status:409})) as typeof fetch
  await assert.rejects(fetchOperationsJson('/test', {method:'PATCH'}), (e: unknown) => e instanceof OperationsRequestError && e.refreshBeforeWrite)
  globalThis.fetch = (async () => Response.json({error:'invalid candidate'}, {status:400})) as typeof fetch
  await assert.rejects(fetchOperationsJson('/test', {method:'PATCH'}), (e: unknown) => e instanceof OperationsRequestError && !e.refreshBeforeWrite)
  globalThis.fetch = (async () => new Response('bad gateway', {status:502})) as typeof fetch
  await assert.rejects(fetchOperationsJson('/test', {method:'PATCH'}), (e: unknown) => e instanceof OperationsRequestError && e.refreshBeforeWrite)
  // Deadline covers slow JSON bodies, not just initial response headers.
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => ({ok:true,json:()=>new Promise((_resolve,reject)=>init.signal?.addEventListener('abort',()=>reject(new Error('body timeout')),{once:true}))})) as typeof fetch
  await assert.rejects(fetchOperationsJson('/test', {}, {timeoutMs:5}), /超时/)
} finally { globalThis.fetch = originalFetch }
console.log('Client deadlines and uncertain-write refresh protection passed')
