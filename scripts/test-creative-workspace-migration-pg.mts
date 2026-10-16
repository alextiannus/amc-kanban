import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PrismaClient} from '@prisma/client'
import {Pool} from 'pg'
import {runCreativeWorkspaceMigration,type MigrationDatabase} from './migrate-creative-workspace.mts'
import {creativeDigest} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {scheduleCreative,unscheduleCreative,validateScheduleInput} from '../src/lib/brand-plan/creativeScheduling.ts'
import {listOpenCalendarCreativeOptions} from '../src/lib/brand-plan/calendarSync.ts'

const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&/^\/amc_lineage_test_[a-zA-Z0-9_]+$/.test(url.pathname),'dedicated local fixture database only')
const prisma=new PrismaClient(),pools=[new Pool({connectionString:url.href,max:1}),new Pool({connectionString:url.href,max:1})]
const adapters:MigrationDatabase[]=pools.map(pool=>({query:(sql,params)=>pool.query(sql,params),transaction:async(fn,readOnly)=>{
 const client=await pool.connect();try{await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');await client.query("SET LOCAL lock_timeout='5s'");const result=await fn(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}}))
const brandId='migration-pg-brand',userId='migration-pg-user',month='2026-11',creativeId='migration-linked'
const invalidItems=[{id:123,title:'Numeric ID stays unchanged'},{title:'Missing ID stays unchanged'}]
const workspace={publishingCalendar:{months:{[month]:[{id:creativeId,title:'Legacy linked script',planning:'Known legacy text',date:'2026-11-02',platform:'instagram'},{id:'migration-undated',title:'No invented source'},{id:'migration-marker-conflict'},{id:'migration-slug',platformSlug:'instagram'},{id:'migration-platform-conflict',platform:'Instagram',platformSlug:'tiktok'},...invalidItems]}}}
try{
 await prisma.auditLog.deleteMany({where:{resourceId:{in:[brandId,creativeId]}}})
 await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}})
 await prisma.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
 await prisma.user.create({data:{id:userId,email:userId+'@example.invalid',password:'fixture-only',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id:brandId,name:'Migration PostgreSQL fixture',crew:{create:{members:{create:{userId,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],marketingSolution:workspace}},accounts:{create:{id:'migration-pg-account',platformId:'instagram',handle:'fixture',postfastAccountId:'fixture-local-only',connectionStatus:'CONNECTED'}}}})
 await prisma.contentDraft.create({data:{id:'migration-pg-draft',brandId,accountId:'migration-pg-account',caption:'Do not overwrite',agentNote:`brand-plan-calendar-item:${creativeId}`,scheduledAt:new Date('2026-11-02T02:00:00Z')}})
 await prisma.contentDraft.create({data:{id:'migration-pg-conflict',brandId,accountId:'migration-pg-account',caption:'Keep conflicting marker evidence',agentNote:'brand-plan-calendar-item:migration-marker-conflict brand-plan-calendar-item:missing'}})
 // Execute the actual branch SQL against PostgreSQL, not a parser/mock. db push
 // bootstrap may already have created this named index, so reset only it here.
 await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "BrandMarketingSolution_feedback_window_idx"')
 await prisma.$executeRawUnsafe(readFileSync('prisma/migrations/20261016060000_creative_feedback_window/migration.sql','utf8'))
 assert.equal((await prisma.$queryRawUnsafe<any[]>('SELECT indexname FROM pg_indexes WHERE indexname=$1','BrandMarketingSolution_feedback_window_idx')).length,1)
 const before=await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}}),draftsBefore=await prisma.contentDraft.findMany({where:{brandId},orderBy:{id:'asc'}})
 const dry=await runCreativeWorkspaceMigration(adapters[0],{brandId})
 assert.equal(dry.mode,'dry-run');assert.equal(dry.writtenBrands,0)
 assert.deepEqual(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}}),before)
 assert.equal(await prisma.auditLog.count({where:{resourceId:brandId}}),0)
 const concurrent=await Promise.all(adapters.map(db=>runCreativeWorkspaceMigration(db,{apply:true,brandId})))
 assert.equal(concurrent.reduce((n,r)=>n+r.writtenBrands,0),1,'two independent connections produce one migration')
 assert.deepEqual(concurrent[0].summary,concurrent[1].summary)
 assert.equal(await prisma.auditLog.count({where:{resourceId:brandId,action:'CREATIVE_WORKSPACE_LEGACY_MIGRATED'}}),1)
 assert.deepEqual(await prisma.contentDraft.findMany({where:{brandId},orderBy:{id:'asc'}}),draftsBefore)
 const saved=(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution as any
 const current=saved.publishingCalendar.months[month][0]
 const migrated=saved.publishingCalendar.months[month]
 assert.equal(migrated[2].schedule,null);assert.equal(migrated[2].migrationStatus,'needs_confirmation')
 assert.deepEqual(migrated[3].platformTargets,['instagram']);assert.equal(migrated[3].legacy.platformSlug,'instagram')
 assert.deepEqual(migrated[4].platformTargets,[]);assert.equal(migrated[4].legacy.platformSlug,'tiktok');assert.equal(migrated[4].migrationStatus,'needs_confirmation')
 assert.deepEqual(migrated.slice(5),invalidItems);assert.equal(dry.summary.invalid,2);assert.equal(dry.summary.needs_confirmation,4)
 assert.equal(current.schedule.legacy,true);assert.equal(current.schedule.scheduledBy,null);assert.equal(current.schedule.scheduledAtRevisionId,null)
 const again=await runCreativeWorkspaceMigration(adapters[0],{apply:true,brandId});assert.equal(again.writtenBrands,0);assert.deepEqual(again.summary,dry.summary)
 assert.throws(()=>validateScheduleInput({platform:'instagram',scheduledAt:null,idempotencyKey:'client-legacy',legacy:true}))
 const actor={id:userId,type:'HUMAN'}
 const canceled=await unscheduleCreative(actor,brandId,creativeId,creativeDigest(current),{month,idempotencyKey:'cancel-legacy-receipt'},prisma)
 assert.equal(canceled.schedule,null)
 assert(!(await prisma.contentDraft.findUniqueOrThrow({where:{id:'migration-pg-draft'}})).agentNote?.includes('null'))
 const scheduled=await scheduleCreative(actor,brandId,creativeId,canceled.expectedRevision,{month,platform:'instagram',scheduledAt:null,idempotencyKey:'explicit-new-schedule'},prisma)
 assert.equal(scheduled.schedule?.draftId,'migration-pg-draft');assert.equal(scheduled.schedule?.scheduledBy,userId);assert(scheduled.schedule?.scheduledAtRevisionId);assert.equal(scheduled.schedule?.legacy,undefined)
 // Reproduce cancellation BEFORE the first migration of an unmigrated dated item.
 await prisma.brandKnowledge.update({where:{brandId},data:{marketingSolution:workspace}})
 const humanNote='Original merchant note\nbrand-plan-calendar-item:'+creativeId
 await prisma.contentDraft.update({where:{id:'migration-pg-draft'},data:{agentNote:humanNote}})
 const beforeCancel=await scheduleCreative(actor,brandId,creativeId,creativeDigest(workspace.publishingCalendar.months[month][0]),{month,platform:'instagram',scheduledAt:'2026-11-02T02:00:00Z',idempotencyKey:'schedule-before-migration'},prisma)
 const canceledBefore=await unscheduleCreative(actor,brandId,creativeId,beforeCancel.expectedRevision,{month,idempotencyKey:'cancel-before-migration'},prisma)
 const canceledDraft=await prisma.contentDraft.findUniqueOrThrow({where:{id:'migration-pg-draft'}})
 assert(canceledDraft.agentNote?.startsWith(humanNote));assert.equal(canceledDraft.scheduledAt,null)
 const canceledProjection=(await listOpenCalendarCreativeOptions(brandId,month,prisma)).find(row=>row.id===creativeId)?.draftId
 const cancelDry=await runCreativeWorkspaceMigration(adapters[0],{brandId});assert.equal(cancelDry.writtenBrands,0)
 await runCreativeWorkspaceMigration(adapters[0],{apply:true,brandId})
 const afterCancel=(await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution as any
 assert.equal(afterCancel.publishingCalendar.months[month][0].schedule,null,'migration must not revive canceled schedule')
 assert.equal(canceledProjection,null,'legacy calendar must not revive a canceled draft')
 assert.deepEqual(await prisma.contentDraft.findUniqueOrThrow({where:{id:'migration-pg-draft'}}),canceledDraft)
 assert.equal((await runCreativeWorkspaceMigration(adapters[0],{apply:true,brandId})).writtenBrands,0)
 const againScheduled=await scheduleCreative(actor,brandId,creativeId,creativeDigest(afterCancel.publishingCalendar.months[month][0]),{month,platform:'instagram',scheduledAt:null,idempotencyKey:'reschedule-after-cancel-migration'},prisma)
 assert.equal(againScheduled.schedule?.draftId,'migration-pg-draft')
 assert.equal((await listOpenCalendarCreativeOptions(brandId,month,prisma)).find(row=>row.id===creativeId)?.draftId,'migration-pg-draft')
 assert.equal(canceledBefore.schedule,null)
 console.log('PASS exact legacy schedule → cancel → calendar projection → dry-run/apply/repeat → explicit reschedule; human note and draft retained')
 // Rollback is checked through the real PostgreSQL trigger and transaction.
 await prisma.brandKnowledge.update({where:{brandId},data:{marketingSolution:workspace}})
 await prisma.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION migration_pg_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='CREATIVE_WORKSPACE_LEGACY_MIGRATED' AND NEW."resourceId"='migration-pg-brand' THEN RAISE EXCEPTION 'migration audit fixture'; END IF; RETURN NEW; END $$`)
 await prisma.$executeRawUnsafe('CREATE TRIGGER migration_pg_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION migration_pg_fail_audit()')
 await assert.rejects(()=>runCreativeWorkspaceMigration(adapters[0],{apply:true,brandId}),/migration audit fixture/)
 assert.deepEqual((await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution,workspace)
 console.log('PASS actual PostgreSQL/Prisma: branch index migration SQL, read-only dry run, two-connection apply lock/idempotency, audit rollback, unchanged drafts, missing-source conflicting markers denied, platformSlug preserved/conflicts reported, invalid identities unchanged, legacy cancel and explicit schedule restores trusted actor/revision; client legacy rejected')
}finally{
 await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS migration_pg_fail_audit ON "AuditLog"').catch(()=>{})
 await prisma.$executeRawUnsafe('DROP FUNCTION IF EXISTS migration_pg_fail_audit()').catch(()=>{})
 await Promise.all(pools.map(pool=>pool.end()));await prisma.$disconnect()
}
