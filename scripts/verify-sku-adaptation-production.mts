import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {prisma} from '../src/lib/prisma.ts'
import {createNativeTask,readNativeTask,adoptNativeCandidate,getNativeHost,controlNativeTask} from '../src/lib/ai-native/service.ts'
import {readCreativeRevisions} from '../src/lib/brand-plan/creativeRevisions.ts'
assert(process.env.RENDER&&process.argv.includes('--production-acceptance'))
const [phase,id]=process.argv.slice(2);assert(['run','inspect','cleanup'].includes(phase)&&/^amc-sku-acceptance-[a-z0-9-]+$/.test(id))
let host:Awaited<ReturnType<typeof getNativeHost>>|undefined
try{
 if(phase==='run'){
  assert(!await prisma.user.findUnique({where:{id}}),'Inspect existing fixture instead of repeating inference')
  await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  await prisma.brand.create({data:{id,name:'Noodle Studio acceptance fixture',description:'Synthetic brand serving families in Singapore. Brand-owned footage of Sesame Noodles preparation is available. Use concise English. SKU catalog is authoritative. No discounts, freshness, daily frequency, health benefits or availability claims are confirmed. Prepare a proposed 15-second script. No content generation or publishing.',industry:'restaurant',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{brandTone:'Concise factual English',audienceAssumptions:'Families choosing lunch',menuItems:[{id:'sku_sesame',name:'Sesame Noodles',description:'Noodles with sesame sauce',price:'8.50',currency:'SGD',isMerchantPick:true}],marketingSolution:{publishingCalendar:{months:{'2099-11':[{id:'source-script',date:'2099-11-17',title:'Reference burger script',planning:'Reference only: Brand X Burger costs 99. Open on cooking, show a closeup, invite viewers to see the menu.',product:'Reference Burger',platform:'Instagram',platformSlug:'instagram',contentType:'视频',inspirationCreativeId:'cre_synthetic_sku_reference'}]}}}}}}})
 }
 const fixture=await prisma.brand.findUniqueOrThrow({where:{id}});assert.equal(fixture.name,'Noodle Studio acceptance fixture');assert.equal(fixture.status,'ARCHIVED');assert.equal(fixture.autoPilot,false)
 host=await getNativeHost();assert((await host.app.runtime.drain({timeoutMs:5000})).drained)
 const rows=await host.pool.query('SELECT task_id FROM amc_ai_requests WHERE subject_id=$1 ORDER BY created_at DESC LIMIT 1',[id])
 let taskId=rows.rows[0]?.task_id
 if(phase==='run'){
  const input={kind:'creative',adaptToBrand:true,creativeId:'source-script',month:'2099-11'}
  const task=await createNativeTask(id,id,input),again=await createNativeTask(id,id,input);assert.equal(task.id,again.id);taskId=task.id
 }
 assert(taskId)
 let task=await readNativeTask(id,id,taskId)
 if(phase==='run'){
  const end=Date.now()+230000;while(['queued','running'].includes(task.status)&&Date.now()<end){await delay(1500);task=await readNativeTask(id,id,taskId)}
  console.log(JSON.stringify({phase:'task',taskId,status:task.status,usage:task.usage,waitingReason:task.waitingReason}))
  assert.equal(task.status,'succeeded');assert(task.candidate&&task.artifact&&task.usage.complete);assert.equal(task.adaptToBrand,true)
  assert.deepEqual(task.candidate.skuIds,['sku_sesame']);assert.match(String(task.candidate.patch.planning),/Sesame Noodles/);assert(!/\b(Burger|99|fresh|daily|healthy)\b/i.test(String(task.candidate.patch.planning)))
  const patch={...task.candidate.patch,planning:task.candidate.patch.planning+'\nHuman review: use only brand-owned footage.'}
  const body={requestKey:'sku-review-save-v1',artifactDigest:task.artifact.digest,patch}
  const saved=await adoptNativeCandidate(id,id,taskId,body),again=await adoptNativeCandidate(id,id,taskId,body);assert.equal(saved.receipt.id,again.receipt.id)
  assert.equal((await readNativeTask(id,id,taskId)).adoption?.receipt.id,saved.receipt.id)
  const history=await readCreativeRevisions({id,type:'HUMAN'},id,'2099-11','source-script',saved.receipt.id)
  assert.equal(history.revisions[0].content.planning,patch.planning);assert.equal(history.revisions[0].actor.id,id);assert.equal(history.revisions[0].source.creativeId,'cre_synthetic_sku_reference');assert.equal(history.revisions[0].ai.taskId,taskId);assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  console.log(JSON.stringify({ok:true,taskId,receiptId:saved.receipt.id,skuIds:task.candidate.skuIds,adaptedScript:task.candidate.patch.planning,usage:task.usage,noPublication:true}))
 }else if(phase==='inspect')console.log(JSON.stringify(task))
 else{
  assert(task.usage.complete);if(['queued','running','waiting'].includes(task.status))await controlNativeTask(id,id,taskId,{action:'cancel',requestKey:'sku-acceptance-cleanup'})
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0);await prisma.brand.delete({where:{id}});await prisma.user.delete({where:{id}});console.log(JSON.stringify({ok:true,fixtureCleaned:true,retained:['Core task','ledger','artifact','audit']}))
 }
}finally{if(host){const d=await host.app.runtime.drain({timeoutMs:5000});if(d.drained)await host.pool.end()}await prisma.$disconnect()}
