import assert from 'node:assert/strict'
import {PGlite} from '@electric-sql/pglite'
import {runCreativeWorkspaceMigration,type MigrationDatabase} from './migrate-creative-workspace.mts'
import {creativeDraftMarker} from '../src/lib/brand-plan/creativeDraftMarker.ts'

const scenarios:Record<string,{items:unknown[];notes:Array<[string,string]>;invalidMonth?:boolean;verify:(items:any[],report:any)=>void}>={
 markers:{items:[{id:'known',date:'2026-11-01'},{id:'repeat'},{id:'encoded'},{id:'conflicting-v2',date:'2026-11-02'},{id:'malformed-v2',date:'2026-11-03'}],notes:[
  ['mixed','brand-plan-calendar-item:known brand-plan-calendar-item:missing'],
  ['repeat','brand-plan-calendar-item:repeat BRAND-PLAN-CALENDAR-ITEM:REPEAT'],
  ['encoded',`${creativeDraftMarker('calendar','encoded')} brand-plan-calendar-item:missing`],
  ['conflicting-v2',`${creativeDraftMarker('calendar','conflicting-v2')} ${creativeDraftMarker('calendar','missing')}`],
  ['malformed-v2','brand-plan-calendar-item:malformed-v2 brand-plan-calendar-item-v2:not-hex'],
 ],verify:(items,report)=>{
  assert.equal(items[0].schedule,null,'known + missing raw marker is ambiguous, even without the missing workspace creative')
  assert.equal(items[0].migrationStatus,'needs_confirmation');assert(items[0].workspaceMigration.result.issues.includes('draft_identity_ambiguous'))
  assert.equal(items[1].schedule.draftId,'repeat','same case-insensitive raw identity remains unique')
  assert.equal(items[2].schedule.draftId,'encoded','valid V2 identity overrides raw compatibility projections')
  assert.equal(items[3].schedule,null);assert.equal(items[4].schedule,null)
  assert.equal(report.summary.needs_confirmation,3)
 }},
 platforms:{items:[{id:'slug',platformSlug:'instagram'},{id:'conflict',platform:'Instagram',platformSlug:'tiktok'},{id:'same',platform:'Instagram',platformSlug:'instagram'},{id:'alias',platform:'Google Maps',platformSlug:'google_business'},{id:'stored',legacy:{platformSlug:'facebook'}},{id:'explicit',platform:'Instagram',platformSlug:'tiktok',platformTargets:['facebook']}],notes:[['conflict','brand-plan-calendar-item:conflict']],verify:items=>{
  assert.deepEqual(items[0].platformTargets,['instagram'],'sole legacy platformSlug remains a compatibility target')
  assert.equal(items[0].legacy.platformSlug,'instagram');assert.equal(items[0].platformSlug,undefined)
  assert.deepEqual(items[1].platformTargets,[]);assert.equal(items[1].legacy.platform,'Instagram');assert.equal(items[1].legacy.platformSlug,'tiktok')
  assert.equal(items[1].migrationStatus,'needs_confirmation');assert(items[1].workspaceMigration.result.issues.includes('legacy_platform_conflict'));assert.equal(items[1].schedule,null)
  assert.deepEqual(items[2].platformTargets,['Instagram']);assert.equal(items[2].migrationStatus,'migrated')
  assert.deepEqual(items[3].platformTargets,['Google Maps']);assert.equal(items[3].migrationStatus,'migrated','known platform aliases do not fabricate a conflict')
  assert.deepEqual(items[4].platformTargets,['facebook']);assert.equal(items[4].legacy.platformSlug,'facebook')
  assert.deepEqual(items[5].platformTargets,['facebook'],'explicit current targets are not overwritten by legacy conflict');assert.equal(items[5].migrationStatus,'needs_confirmation')
 }},
 identities:{items:[{id:'valid'},{id:123,date:'2026-11-01'},{title:'Missing ID'},null,'raw',{id:''},{id:'x'.repeat(201)}],notes:[['valid','brand-plan-calendar-item:valid']],invalidMonth:true,verify:(items,report)=>{
  assert.equal(items[0].schedule.draftId,'valid','malformed neighbors must neither crash nor wildcard-match the valid draft')
  assert.deepEqual(items.slice(1),scenarios.identities.items.slice(1),'invalid identities remain byte-equivalent JSON values')
  assert.equal(report.summary.invalid,7);assert.equal(report.summary.needs_confirmation,7)
 }},
}
const selected=process.argv[2]?[process.argv[2]]:Object.keys(scenarios)
assert(selected.every(name=>name in scenarios),'unknown review scenario')
for(const name of selected){
 const scenario=scenarios[name],db=new PGlite()
 try{
  await db.exec(`CREATE TABLE "BrandKnowledge" (id text PRIMARY KEY,"brandId" text UNIQUE,"marketingSolution" jsonb,"brandPlan" jsonb,"updatedAt" timestamp DEFAULT now());
  CREATE TABLE "SocialAccount" (id text PRIMARY KEY,"brandId" text,"platformId" text);
  CREATE TABLE "ContentDraft" (id text PRIMARY KEY,"brandId" text,"accountId" text,"agentNote" text,"scheduledAt" timestamp);
  CREATE TABLE "AuditLog" (id text PRIMARY KEY,"actorId" text,"actorType" text,action text,"resourceId" text,"resourceType" text,"oldValue" jsonb,"newValue" jsonb,metadata jsonb);`)
  const workspace={publishingCalendar:{months:{'2026-11':scenario.items,...(scenario.invalidMonth?{'bad-month':[{id:'valid'}]}:{})}}}
  await db.query('INSERT INTO "BrandKnowledge" VALUES ($1,$2,$3,null,now())',['knowledge','brand',workspace])
  await db.query('INSERT INTO "SocialAccount" VALUES ($1,$2,$3)',['account','brand','instagram'])
  for(const [id,note] of scenario.notes)await db.query('INSERT INTO "ContentDraft" VALUES ($1,$2,$3,$4,null)',[id,'brand','account',note])
  const adapter:MigrationDatabase={query:(sql,params)=>db.query(sql,params),transaction:async fn=>db.transaction(tx=>fn({query:(sql,params)=>tx.query(sql,params)}))}
  const before=await db.query('SELECT * FROM "BrandKnowledge"'),drafts=await db.query('SELECT * FROM "ContentDraft"')
  const dry=await runCreativeWorkspaceMigration(adapter)
  assert.equal(dry.writtenBrands,0);assert.deepEqual(await db.query('SELECT * FROM "BrandKnowledge"'),before)
  assert.equal((await db.query('SELECT * FROM "AuditLog"')).rows.length,0)
  const apply=await runCreativeWorkspaceMigration(adapter,{apply:true});assert.deepEqual(apply.summary,dry.summary)
  const saved=((await db.query('SELECT "marketingSolution" FROM "BrandKnowledge"')).rows[0] as any).marketingSolution
  scenario.verify(saved.publishingCalendar.months['2026-11'],apply)
  if(scenario.invalidMonth)assert.deepEqual(saved.publishingCalendar.months['bad-month'],[{id:'valid'}])
  const audit=await db.query('SELECT * FROM "AuditLog"'),again=await runCreativeWorkspaceMigration(adapter,{apply:true})
  assert.equal(again.writtenBrands,0);assert.deepEqual(again.summary,apply.summary)
  assert.deepEqual(await db.query('SELECT * FROM "AuditLog"'),audit);assert.deepEqual(await db.query('SELECT * FROM "ContentDraft"'),drafts)
  console.log(`PASS migration review ${name}: read-only dry-run, evidence-preserving apply, stable repeat and unchanged drafts`)
 }finally{await db.close()}
}
