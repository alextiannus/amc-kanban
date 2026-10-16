import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {runCreativeWorkspaceMigration,parseMigrationArgs} from './migrate-creative-workspace.mts'

const db=new PGlite()
await db.exec(`CREATE TABLE "BrandKnowledge" (id text PRIMARY KEY,"brandId" text UNIQUE,"marketingSolution" jsonb,"brandPlan" jsonb,"updatedAt" timestamp DEFAULT now());
CREATE TABLE "SocialAccount" (id text PRIMARY KEY,"brandId" text,"platformId" text);
CREATE TABLE "ContentDraft" (id text PRIMARY KEY,"brandId" text,"accountId" text,"agentNote" text,"scheduledAt" timestamp,status text);
CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorId" text,"actorType" text,"action" text,"resourceId" text,"resourceType" text,"oldValue" jsonb,"newValue" jsonb,metadata jsonb);`)
const items=[
 {id:'dated',date:'2026-11-01',platform:'Instagram',title:'Dated',status:'planned_unimplemented',planning:'old'},
 {id:'linked',date:'2026-11-02',platform:'Instagram',title:'Linked',inspirationCreativeId:'known-source'},
 {id:'ambiguous',date:'2026-11-03',platform:'Instagram',title:'Ambiguous'},
 {id:'undated',title:'Undated'},
 {id:'prefix',date:'2026-11-04',platform:'Instagram',title:'Not prefix2'},
 {id:'cross',date:'2026-11-05',platform:'Instagram',title:'Cross brand'},
]
const workspace={unrelated:{keep:true},publishingCalendar:{months:{'2026-11':items}}}
await db.query('INSERT INTO "BrandKnowledge" VALUES ($1,$2,$3,null,now())',['knowledge','brand',workspace])
await db.query('INSERT INTO "SocialAccount" VALUES ($1,$2,$3)',['account','brand','instagram'])
for(const [id,creative,brand] of [['draft','linked','brand'],['amb-1','ambiguous','brand'],['amb-2','ambiguous','brand'],['prefix2','prefix2','brand'],['cross-draft','cross','other']])await db.query('INSERT INTO "ContentDraft" VALUES ($1,$2,$3,$4,$5,$6)',[id,brand,'account',`brand-plan-calendar-item:${creative}`,'2026-11-10T02:00:00Z','draft'])
const query=async(sql:string,params:unknown[]=[])=>db.query(sql,params)
const adapter={query,transaction:async<T>(fn:(tx:{query:typeof query})=>Promise<T>,readOnly:boolean)=>db.transaction(async tx=>fn({query:(sql,params)=>tx.query(sql,params)}))}
assert.equal(parseMigrationArgs([]).apply,false)
assert.equal(parseMigrationArgs(['--apply']).apply,true)
assert.throws(()=>parseMigrationArgs(['--apply','--dry-run']),/conflicting/)
assert.throws(()=>parseMigrationArgs(['--force']),/unknown/)
const before=await db.query('SELECT * FROM "BrandKnowledge"')
const dry=await runCreativeWorkspaceMigration(adapter)
assert.deepEqual(await db.query('SELECT * FROM "BrandKnowledge"'),before,'default is pure read only')
assert.equal((await db.query('SELECT * FROM "AuditLog"')).rows.length,0)
assert.equal(dry.summary.total,6);assert.equal(dry.summary.needs_confirmation,4)
const applied=await runCreativeWorkspaceMigration(adapter,{apply:true})
assert.deepEqual(applied.summary,dry.summary)
const read=async()=>((await db.query('SELECT "marketingSolution" FROM "BrandKnowledge"')).rows[0] as any).marketingSolution
const saved=await read(),get=(id:string)=>saved.publishingCalendar.months['2026-11'].find((row:any)=>row.id===id)
assert.equal(get('linked').schedule.draftId,'draft');assert.equal(get('linked').schedule.legacy,true)
assert.equal(get('linked').schedule.scheduledBy,null);assert.equal(get('linked').schedule.scheduledAtRevisionId,null)
assert.equal(get('linked').source,null);assert.equal(get('linked').inspirationCreativeId,'known-source');assert.equal(get('linked').skuDecision,null)
assert.equal(get('ambiguous').migrationStatus,'needs_confirmation');assert.equal(get('ambiguous').schedule,null)
assert.equal(get('undated').schedule,null);assert.equal(get('undated').date,undefined)
assert.equal(get('dated').legacy.date,'2026-11-01');assert.equal(get('dated').date,undefined)
assert.equal(get('prefix').schedule,null);assert.equal(get('cross').schedule,null)
assert.deepEqual(saved.unrelated,{keep:true})
const audit=await db.query('SELECT * FROM "AuditLog"');assert.equal(audit.rows.length,1);assert.equal((audit.rows[0] as any).actorId,null)
const again=await runCreativeWorkspaceMigration(adapter,{apply:true})
assert.deepEqual(again.summary,applied.summary);assert.equal(again.writtenBrands,0)
assert.deepEqual(await read(),saved);assert.deepEqual(await db.query('SELECT * FROM "AuditLog"'),audit)
assert.equal((await db.query('SELECT * FROM "ContentDraft"')).rows.length,5,'never creates or modifies drafts')
await db.query('UPDATE "BrandKnowledge" SET "marketingSolution"=$1',[workspace])
await db.exec(`CREATE FUNCTION fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'audit rollback fixture'; END $$; CREATE TRIGGER fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION fail_audit();`)
await assert.rejects(()=>runCreativeWorkspaceMigration(adapter,{apply:true}),/audit rollback fixture/)
assert.deepEqual(await read(),workspace,'audit failure rolls back workspace projection')
await db.close()
console.log('PASS real PGlite SQL: default dry-run, unique marker, ambiguity, prefix/cross-brand denial, unknown evidence preservation, audit rollback, repeated apply stability')
await import('./test-creative-workspace-migration-review.mts')
