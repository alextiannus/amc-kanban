import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { PrismaClient } from '@prisma/client'
import { readCreativeRevisions, saveCreativeRevision } from '../src/lib/brand-plan/creativeRevisions.ts'

if (!process.argv.includes('--rollback-only')) throw new Error('Requires --rollback-only; never persists smoke fixtures')
const db=new PrismaClient(),id=`creative-smoke-${randomUUID()}`,month='2099-11'
const rollback=new Error('verified_rollback')
try {
 await db.$transaction(async tx=>{
  // These rows remain uncommitted and invisible to operational workers.
  await tx.user.create({data:{id,email:`${id}@example.invalid`,nickname:'Isolated rollback verifier',password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  const content={id:'smoke-idea',date:'2099-11-15',title:'Smoke original',platform:'Instagram',platformSlug:'instagram',contentType:'image',product:'Fixture',planning:'Isolated fixture',inspirationCreativeId:'cre_fixture',inspirationSourceTitle:'Fixture source'}
  await tx.brand.create({data:{id,name:'Isolated creative rollback verification',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],marketingSolution:{publishingCalendar:{months:{[month]:[content]}}}}}}})
  const adapter={...tx,$transaction:async(fn:any)=>fn(tx)} as any
  const actor={id,type:'HUMAN'}
  const before=await readCreativeRevisions(actor,id,month,content.id,undefined,adapter)
  const body={expectedRevision:before.expectedRevision,idempotencyKey:'rollback-smoke-request',patch:{planning:'Verified edit'}}
  const saved=await saveCreativeRevision(actor,id,month,content.id,body,adapter)
  const read=await readCreativeRevisions(actor,id,month,content.id,saved.receipt.id,adapter)
  assert.equal(read.revisions[0].actor.id,id)
  assert.equal(read.revisions[0].principals[0].userId,id)
  assert.equal(read.revisions[0].source.creativeId,'cre_fixture')
  assert.equal(read.revisions[0].contentHash,saved.receipt.contentHash)
  assert.equal((await saveCreativeRevision(actor,id,month,content.id,body,adapter)).receipt.id,saved.receipt.id)
  assert.equal(await tx.brandMarketingSolution.count({where:{brandId:id}}),2)
  assert.equal(await tx.auditLog.count({where:{actorId:id}}),1)
  assert.equal(await tx.contentDraft.count({where:{brandId:id}}),0)
  const editorId=id+'-editor',roleId=id+'-role'
  await tx.roleDefinition.create({data:{id:roleId,name:roleId,normalizedName:roleId,policy:{create:{grants:['brand.read','draft.read','draft.update']}}}})
  await tx.user.create({data:{id:editorId,email:editorId+'@example.invalid',password:randomUUID(),businessRoles:{create:{role:roleId}}}})
  const crew=await tx.marketingCrew.findUniqueOrThrow({where:{brandId:id}})
  await tx.crewMember.create({data:{crewId:crew.id,userId:editorId,role:'EDITOR'}})
  const editor={id:editorId,type:'HUMAN'}
  const owned=await saveCreativeRevision(actor,id,month,content.id,{expectedRevision:read.expectedRevision,idempotencyKey:'owned-original',saveMode:'overwrite',patch:{planning:'Owned original'}},adapter)
  const accessible=await readCreativeRevisions(editor,id,month,content.id,undefined,adapter)
  assert.equal(accessible.canSaveAsNew,true);assert.equal(accessible.canOverwrite,false)
  const copyRequest={expectedRevision:owned.receipt.contentHash,idempotencyKey:'scoped-copy',saveMode:'copy',patch:{planning:'Content editor copy'}}
  const copy=await saveCreativeRevision(editor,id,month,content.id,copyRequest,adapter)
  assert.equal(copy.receipt.content.scriptOwner.id,editorId)
  assert.equal((await saveCreativeRevision(editor,id,month,content.id,copyRequest,adapter)).receipt.id,copy.receipt.id)
  const copyRead=await readCreativeRevisions(editor,id,month,copy.receipt.content.id,copy.receipt.id,adapter)
  assert.equal(copyRead.revisions[0].contentHash,copy.receipt.contentHash)
  assert.deepEqual((await readCreativeRevisions(editor,id,month,content.id,undefined,adapter)).current,owned.receipt.content)
  await assert.rejects(saveCreativeRevision(editor,id,month,content.id,{...copyRequest,saveMode:'overwrite',idempotencyKey:'denied-overwrite'},adapter),(e:any)=>e.code==='script_owner_required')
  throw rollback
 },{maxWait:15000,timeout:30000})
 throw new Error('Rollback sentinel was not reached')
} catch(error) {
 if(error!==rollback) throw error
 assert.equal(await db.user.count({where:{id:{startsWith:id}}}),0)
 assert.equal(await db.roleDefinition.findUnique({where:{id:id+'-role'}}),null)
 assert.equal(await db.brand.findUnique({where:{id}}),null)
 assert.equal(await db.auditLog.count({where:{actorId:id}}),0)
 console.log(JSON.stringify({ok:true,version:process.env.RENDER_GIT_COMMIT || 'local',mode:'rollback-only',checks:['save','source','actor','principal','readback','idempotency','audit','no-downstream-writes','content-editor-copy-without-brand-update','original-owner-protected','complete-rollback']}))
} finally {await db.$disconnect()}
