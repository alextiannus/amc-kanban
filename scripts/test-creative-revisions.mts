import assert from 'node:assert/strict'
import { PrismaClient } from '@prisma/client'
import { readCreativeRevisions, saveCreativeRevision, protectTrackedCreativeChanges } from '../src/lib/brand-plan/creativeRevisions.ts'
import { creativeDigest, validateCreativePatch } from '../src/lib/brand-plan/creativeRevisionContract.ts'

const url = process.env.DATABASE_URL || ''
if (!/^postgresql:\/\/[^/]+\/(amc_lineage_test_[a-zA-Z0-9_]+)(\?|$)/.test(url) || !['localhost','127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Requires a dedicated local amc_lineage_test_* database')
const db = new PrismaClient()
const month='2026-11', brandId='lineage-test-brand', id='idea-one'
const actor={id:'lineage-principal',type:'HUMAN'}
const item={id,date:'2026-11-15',title:'Original',platform:'Instagram',platformSlug:'instagram',contentType:'图文',product:'Lunch',planning:'Original plan',status:'已生成',inspirationCreativeId:'cre_original',inspirationSourceTitle:'Original source',inspirationSourceSummary:'Original excerpt',sampleOriginalUrl:'https://example.com/original',materialRequirements:[]}
const workspace={publishingCalendar:{months:{[month]:[item,{...item,id:'idea-two',title:'Other card'}]}}}
const expectCode = async (fn:()=>Promise<any>,code:string)=>assert.rejects(fn,(e:any)=>e.code===code)
try {
  // Only reset labelled fixtures in the dedicated database.
  await db.auditLog.deleteMany({where:{resourceId:{in:[id,'idea-two']}}})
  await db.brand.deleteMany({where:{id:{in:[brandId,'lineage-other-brand']}}})
  await db.user.deleteMany({where:{id:{startsWith:'lineage-'}}})
  await db.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
  for(const userId of [actor.id,'lineage-next-principal','lineage-outsider']) await db.user.create({data:{id:userId,email:`${userId}@example.invalid`,password:'test-not-login',nickname:userId,businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  await db.brand.create({data:{id:brandId,name:'Lineage isolated test',crew:{create:{members:{create:[{userId:actor.id,role:'PRINCIPAL'},{userId:'lineage-next-principal',role:'EDITOR'}]}}},knowledge:{create:{negPrompts:[],marketingSolution:workspace}}}})
  await db.brand.create({data:{id:'lineage-other-brand',name:'Other isolated brand',knowledge:{create:{negPrompts:[],marketingSolution:workspace}}}})
  let state=await readCreativeRevisions(actor,brandId,month,id,undefined,db)
  assert.equal(state.revisions.length,0)
  const request={expectedRevision:state.expectedRevision,idempotencyKey:'first-request',patch:{title:'First edit',planning:'Principal rewrite'},actorId:'lineage-outsider'}
  const first=await saveCreativeRevision(actor,brandId,month,id,request,db)
  assert.equal(first.receipt.revision,1);assert.equal(first.receipt.actor.id,actor.id)
  assert.equal(first.receipt.principals[0].userId,actor.id)
  assert.equal(first.receipt.source.creativeId,'cre_original');assert.equal(first.receipt.source.evidence,'plan_snapshot');assert.equal(first.receipt.source.version,null)
  state=await readCreativeRevisions(actor,brandId,month,id,undefined,db)
  assert.equal(state.revisions.length,2)
  assert.equal(state.revisions[1].origin,'legacy_unknown');assert.equal(state.revisions[1].actor,null)
  assert.deepEqual(state.revisions[1].content,item)
  assert.equal(first.receipt.parentRevisionId,state.revisions[1].id)
  const replay=await saveCreativeRevision(actor,brandId,month,id,request,db)
  assert(replay.replayed);assert.equal(replay.receipt.id,first.receipt.id)
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...request,patch:{title:'Changed request'}},db),'creative_request_key_reused')
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...request,idempotencyKey:'stale-request'},db),'creative_revision_conflict')
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...request,patch:{inspirationCreativeId:'forged'}},db),'invalid_creative_patch')
  await expectCode(()=>readCreativeRevisions(actor,'lineage-other-brand',month,id,undefined,db),'creative_access_denied')
  await expectCode(()=>readCreativeRevisions({id:'lineage-outsider',type:'HUMAN'},brandId,month,id,undefined,db),'creative_access_denied')
  await expectCode(()=>readCreativeRevisions(actor,brandId,month,id,'not-this-revision',db),'creative_revision_not_found')
  const pair=await Promise.allSettled(['concurrent-one','concurrent-two'].map(key=>saveCreativeRevision(actor,brandId,month,id,{expectedRevision:state.expectedRevision,idempotencyKey:key,patch:{title:key}},db)))
  assert.equal(pair.filter(r=>r.status==='fulfilled').length,1)
  assert.equal((pair.find(r=>r.status==='rejected') as PromiseRejectedResult).reason.code,'creative_revision_conflict')
  const knowledge=await db.brandKnowledge.findUniqueOrThrow({where:{brandId}})
  assert.equal((knowledge.marketingSolution as any).publishingCalendar.months[month][1].title,'Other card')
  const before=structuredClone(knowledge.marketingSolution)
  const changed=structuredClone(before) as any;changed.publishingCalendar.months[month][0].title='legacy overwrite'
  await expectCode(()=>protectTrackedCreativeChanges(brandId,before,changed,db),'tracked_creative_requires_revision_save')
  await protectTrackedCreativeChanges(brandId,before,before,db)
  await db.crewMember.updateMany({where:{userId:actor.id},data:{role:'EDITOR'}})
  await db.crewMember.updateMany({where:{userId:'lineage-next-principal'},data:{role:'PRINCIPAL'}})
  state=await readCreativeRevisions(actor,brandId,month,id,undefined,db)
  const second=await saveCreativeRevision(actor,brandId,month,id,{expectedRevision:state.expectedRevision,idempotencyKey:'after-transfer',patch:{planning:'After principal transfer'}},db)
  assert.equal(second.receipt.principals[0].userId,'lineage-next-principal')
  assert.equal((await readCreativeRevisions(actor,brandId,month,id,first.receipt.id,db)).revisions[0].principals[0].userId,actor.id)
  assert.equal(second.receipt.originalRevisionId,first.receipt.originalRevisionId)
  state=await readCreativeRevisions(actor,brandId,month,id,undefined,db)
  const snapshot=JSON.stringify(state)
  await db.$executeRawUnsafe(`CREATE OR REPLACE FUNCTION lineage_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'CREATIVE_REVISION_SAVED' THEN RAISE EXCEPTION 'test audit failure'; END IF; RETURN NEW; END $$`)
  await db.$executeRawUnsafe(`CREATE TRIGGER lineage_test_fail_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION lineage_test_fail_audit()`)
  await assert.rejects(()=>saveCreativeRevision(actor,brandId,month,id,{expectedRevision:state.expectedRevision,idempotencyKey:'rollback-request',patch:{title:'Must roll back'}},db))
  await db.$executeRawUnsafe('DROP TRIGGER lineage_test_fail_audit ON "AuditLog"')
  assert.equal(JSON.stringify(await readCreativeRevisions(actor,brandId,month,id,undefined,db)),snapshot)
  const older = await readCreativeRevisions(actor,brandId,month,id,undefined,db,2)
  assert.deepEqual(older.revisions.map((r:any)=>r.revision),[1,0])
  await db.crewMember.updateMany({where:{userId:actor.id},data:{active:false}})
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,request,db),'creative_access_denied')
  assert.throws(()=>validateCreativePatch({date:'2026-11-31'},month))
  assert.throws(()=>validateCreativePatch({date:'2026-12-01'},month))
  assert.equal(creativeDigest({a:1,b:2}),creativeDigest({b:2,a:1}))
  assert.equal(await db.contentDraft.count({where:{brandId}}),0)
  console.log('PASS: PostgreSQL baseline, lineage, trusted actor, principal transfer, source protection, scoped reads, replay, concurrency, rollback, revocation and no downstream publishing')
} finally {
  await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS lineage_test_fail_audit ON "AuditLog"').catch(()=>{})
  await db.$disconnect()
}
