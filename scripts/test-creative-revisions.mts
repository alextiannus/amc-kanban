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
  await db.rolePermissionPolicy.deleteMany({where:{role:'lineage-content-editor'}})
  await db.roleDefinition.deleteMany({where:{id:'lineage-content-editor'}})
  await db.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
  for(const userId of [actor.id,'lineage-next-principal','lineage-outsider']) await db.user.create({data:{id:userId,email:`${userId}@example.invalid`,password:'test-not-login',nickname:userId,businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  await db.brand.create({data:{id:brandId,name:'Lineage isolated test',crew:{create:{members:{create:[{userId:actor.id,role:'PRINCIPAL'},{userId:'lineage-next-principal',role:'EDITOR'}]}}},knowledge:{create:{negPrompts:[],marketingSolution:workspace}}}})
  await db.brand.create({data:{id:'lineage-other-brand',name:'Other isolated brand',knowledge:{create:{negPrompts:[],marketingSolution:workspace}}}})
  let state=await readCreativeRevisions(actor,brandId,month,id,undefined,db)
  assert.equal(state.revisions.length,0)
  const request={expectedRevision:state.expectedRevision,idempotencyKey:'first-request',patch:{title:'First edit',planning:'Principal rewrite'}}
  const forgedActorBefore={solutions:await db.brandMarketingSolution.count({where:{brandId}}),audits:await db.auditLog.count({where:{resourceId:id}}),knowledge:JSON.stringify((await db.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution)}
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...request,actorId:'lineage-outsider'},db),'invalid_creative_revision_request')
  assert.deepEqual({solutions:await db.brandMarketingSolution.count({where:{brandId}}),audits:await db.auditLog.count({where:{resourceId:id}}),knowledge:JSON.stringify((await db.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution)},forgedActorBefore)
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
  // Explicit save-as-new preserves the original and assigns ownership from the session.
  state=await readCreativeRevisions(actor,brandId,month,id,undefined,db)
  const originalBeforeCopy=structuredClone(state.current)
  const copyRequest={expectedRevision:state.expectedRevision,idempotencyKey:'copy-script-one',saveMode:'copy',patch:{planning:'My personal rewrite',aiTags:['forged-tags']}}
  const forgedOwnerBefore={solutions:await db.brandMarketingSolution.count({where:{brandId}}),audits:await db.auditLog.count({where:{resourceId:id}}),knowledge:JSON.stringify((await db.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution)}
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...copyRequest,scriptOwner:{id:'lineage-outsider'}},db),'invalid_creative_revision_request')
  assert.deepEqual({solutions:await db.brandMarketingSolution.count({where:{brandId}}),audits:await db.auditLog.count({where:{resourceId:id}}),knowledge:JSON.stringify((await db.brandKnowledge.findUniqueOrThrow({where:{brandId}})).marketingSolution)},forgedOwnerBefore)
  const copied=await saveCreativeRevision(actor,brandId,month,id,copyRequest,db)
  const copiedId=copied.receipt.content.id
  assert.notEqual(copiedId,id)
  assert.equal(copied.receipt.content.scriptOwner.id,actor.id)
  assert.deepEqual(copied.receipt.content.aiTags,originalBeforeCopy.aiTags||[])
  assert.deepEqual((await readCreativeRevisions(actor,brandId,month,id,undefined,db)).current,originalBeforeCopy)
  assert.equal((await saveCreativeRevision(actor,brandId,month,id,copyRequest,db)).receipt.id,copied.receipt.id)
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...copyRequest,patch:{planning:'Different'}},db),'creative_request_key_reused')
  await expectCode(()=>saveCreativeRevision(actor,brandId,month,id,{...copyRequest,saveMode:'overwrite'},db),'creative_request_key_reused')
  const otherActor={id:'lineage-next-principal',type:'HUMAN'}
  let copiedState=await readCreativeRevisions(otherActor,brandId,month,copiedId,undefined,db)
  assert.equal(copiedState.canOverwrite,false);assert.equal(copiedState.canSaveAsNew,true)
  await expectCode(()=>saveCreativeRevision(otherActor,brandId,month,copiedId,{expectedRevision:copiedState.expectedRevision,idempotencyKey:'forbidden-owner-write',saveMode:'overwrite',patch:{planning:'Cannot overwrite'}},db),'script_owner_required')
  const otherCopy=await saveCreativeRevision(otherActor,brandId,month,copiedId,{expectedRevision:copiedState.expectedRevision,idempotencyKey:'other-user-copy',saveMode:'copy',patch:{planning:'Other user draft'}},db)
  assert.equal(otherCopy.receipt.content.scriptOwner.id,otherActor.id)
  copiedState=await readCreativeRevisions(actor,brandId,month,copiedId,undefined,db)
  const ownUpdate=await saveCreativeRevision(actor,brandId,month,copiedId,{expectedRevision:copiedState.expectedRevision,idempotencyKey:'own-overwrite',saveMode:'overwrite',patch:{planning:'Updated my copy'}},db)
  assert.equal(ownUpdate.receipt.content.id,copiedId)
  assert.equal(ownUpdate.receipt.content.scriptOwner.id,actor.id)
  const concurrent=await Promise.all(['same-copy-request','same-copy-request'].map(idempotencyKey=>saveCreativeRevision(actor,brandId,month,id,{...copyRequest,idempotencyKey},db)))
  assert.equal(concurrent[0].receipt.id,concurrent[1].receipt.id)
  console.log('PASS: copy/overwrite, trusted ownership, inherited tags, original preserved, concurrent copy replay and cross-user overwrite denial')
  // A scoped content editor can copy another owner's script without brand.update.
  const editorRole='lineage-content-editor',editor={id:'lineage-content-editor',type:'HUMAN'}
  await db.roleDefinition.create({data:{id:editorRole,name:'Content editor',normalizedName:editorRole,policy:{create:{grants:['brand.read','draft.read','draft.update','asset.read','asset.create']}}}})
  await db.user.create({data:{id:editor.id,email:editor.id+'@example.invalid',password:'not-login',businessRoles:{create:{role:editorRole}}}})
  const crew=await db.marketingCrew.findUniqueOrThrow({where:{brandId}})
  await db.crewMember.create({data:{crewId:crew.id,userId:editor.id,role:'EDITOR'}})
  const editable=await readCreativeRevisions(editor,brandId,month,copiedId,undefined,db)
  assert.equal(editable.canSaveAsNew,true);assert.equal(editable.canOverwrite,false)
  const editorRequest={expectedRevision:editable.expectedRevision,idempotencyKey:'scoped-editor-copy',saveMode:'copy',patch:{planning:'Scoped editor copy'}}
  const editorCopy=await saveCreativeRevision(editor,brandId,month,copiedId,editorRequest,db)
  assert.equal(editorCopy.receipt.content.scriptOwner.id,editor.id)
  assert.equal((await saveCreativeRevision(editor,brandId,month,copiedId,editorRequest,db)).receipt.id,editorCopy.receipt.id)
  assert.deepEqual((await readCreativeRevisions(editor,brandId,month,copiedId,undefined,db)).current,editable.current)
  await expectCode(()=>saveCreativeRevision(editor,brandId,month,copiedId,{...editorRequest,saveMode:'overwrite',idempotencyKey:'editor-no-overwrite'},db),'script_owner_required')
  await expectCode(()=>saveCreativeRevision(editor,'lineage-other-brand',month,id,editorRequest,db),'creative_access_denied')
  // Asset upload grants still allow brand WRITE, but never grant script editing.
  await db.rolePermissionPolicy.update({where:{role:editorRole},data:{grants:['brand.read','asset.read','asset.create']}})
  const revoked=await readCreativeRevisions(editor,brandId,month,copiedId,undefined,db)
  assert.equal(revoked.canSaveAsNew,false);assert.equal(revoked.canOverwrite,false)
  await expectCode(()=>saveCreativeRevision(editor,brandId,month,copiedId,editorRequest,db),'creative_edit_forbidden')
  console.log('PASS: scoped content editor copy without brand.update; unrelated write grant and live revocation denied')
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
