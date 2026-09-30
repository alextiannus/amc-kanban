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
  throw rollback
 },{maxWait:15000,timeout:30000})
 throw new Error('Rollback sentinel was not reached')
} catch(error) {
 if(error!==rollback) throw error
 assert.equal(await db.user.findUnique({where:{id}}),null)
 assert.equal(await db.brand.findUnique({where:{id}}),null)
 assert.equal(await db.auditLog.count({where:{actorId:id}}),0)
 console.log(JSON.stringify({ok:true,version:process.env.RENDER_GIT_COMMIT || 'local',mode:'rollback-only',checks:['save','source','actor','principal','readback','idempotency','audit','no-downstream-writes','complete-rollback']}))
} finally {await db.$disconnect()}
