// Explicit synthetic acceptance. Reads the real library and model; no production media or social publishing.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {prisma} from '../src/lib/prisma.ts'
import {createNativeTask,readNativeTask,adoptNativeCandidate,controlNativeTask,getNativeHost} from '../src/lib/ai-native/service.ts'
import {actorFor} from '../src/lib/ai-native/contract.ts'
import {readCreativeRevisions} from '../src/lib/brand-plan/creativeRevisions.ts'
import {listOpenCalendarCreativeOptions} from '../src/lib/brand-plan/calendarSync.ts'
const [phase,id]=process.argv.slice(2),key=process.argv.find(v=>v.startsWith('--request-key='))?.slice(14)||'production-library-discovery-v2'
assert(process.env.RENDER&&process.argv.includes('--production-acceptance'))
assert(['run','inspect','cleanup'].includes(phase)&&/^amc-discovery-acceptance-[a-z0-9-]{8,40}$/.test(id||''))
let host:Awaited<ReturnType<typeof getNativeHost>>|undefined
try{
 if(phase==='run'){
  if(!await prisma.user.findUnique({where:{id}}))await prisma.user.create({data:{id,email:`${id}@example.invalid`,nickname:'AMC discovery acceptance fixture',password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  if(!await prisma.brand.findUnique({where:{id}}))await prisma.brand.create({data:{id,name:'AMC discovery acceptance fixture (archived)',description:'Synthetic test restaurant: handmade noodles prepared in the kitchen. Audience: families choosing lunch in Singapore. Voice: clear and factual. Available brand assets: own kitchen preparation footage. No prices, discounts, health claims or external publishing authorized.',industry:'restaurant',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:['Do not invent promotions or prices'],brandTone:'Concise English',audienceAssumptions:'Families choosing lunch',productAssumptions:'Handmade noodles'}}}})
 }
 const fixture=await prisma.brand.findUniqueOrThrow({where:{id}});assert.equal(fixture.status,'ARCHIVED');assert.equal(fixture.autoPilot,false);assert.equal(fixture.name,'AMC discovery acceptance fixture (archived)')
 host=await getNativeHost();assert((await host.app.runtime.drain({timeoutMs:5000})).drained)
 const actor=actorFor(id,id),store=host.app.tasks as {findRequest(a:typeof actor,c:string,k:string):Promise<{id:string}|null>}
 if(phase==='run'&&key!=='production-library-discovery-v1'){
  const previous=await store.findRequest(actor,'agent.work','production-library-discovery-v1')
  if(previous){const old=await readNativeTask(id,id,previous.id);if(old.status==='waiting'&&old.waitingReason==='model_output_limit'&&old.usage.complete)await controlNativeTask(id,id,old.id,{action:'cancel',requestKey:'superseded-by-bounded-discovery-v2'})}
 }
 let original=await store.findRequest(actor,'agent.work',key)
 if(phase==='run')original=await createNativeTask(id,id,{kind:'creative_discovery',goal:'Recommend 1-3 real original library creatives for this synthetic noodle restaurant using only given facts. Prepare concise English review candidates and material needs. Do not invent promotions or prices. If no original source fits, return an empty result honestly. Write and read back the required artifact. No paid media or publishing.',requestKey:key})
 assert(original,'Original task must exist')
 let task=await readNativeTask(id,id,original.id)
 if(phase==='run'){
  const end=Date.now()+215000
  while(['queued','running'].includes(task.status)&&Date.now()<end){await delay(1500);task=await readNativeTask(id,id,original.id)}
  console.log(JSON.stringify({phase:'task',taskId:task.id,status:task.status,waitingReason:task.waitingReason,inputRequest:task.inputRequest,usage:task.usage}))
  assert.equal(task.status,'succeeded','Inspect the same task before retrying an uncertain result')
  assert(task.recommendations&&task.artifact&&task.usage.complete)
  assert(task.recommendations.recommendations.length>0,'No matching library sources; do not claim successful recommendation adoption')
  const c=task.recommendations.recommendations[0]
  const body={requestKey:'production-review-adopt-v1',artifactDigest:task.artifact.digest,sourceCreativeId:c.sourceCreativeId,patch:{title:c.title,planning:`${c.planning}\nHuman acceptance review: use only this brand’s own preparation footage.`,aiCaption:c.aiCaption,materialRequirements:c.materialRequirements,date:'2099-11-17',platform:'instagram'}}
  const saved:any=await adoptNativeCandidate(id,id,task.id,body),again=await adoptNativeCandidate(id,id,task.id,body)
  assert.equal(saved.receipt.id,again.receipt.id);assert(saved.verified)
  const history=await readCreativeRevisions({id,type:'HUMAN'},id,saved.month,saved.creativeId)
  assert.equal(history.revisions[0].actor.id,id);assert.equal(history.revisions[0].source.creativeId,c.sourceCreativeId);assert.equal(history.revisions[0].ai.taskId,task.id);assert.equal(history.revisions.length,2)
  assert.equal((await listOpenCalendarCreativeOptions(id,saved.month))[0].id,saved.creativeId)
  assert.equal((await readNativeTask(id,id,task.id)).adoptions[0].creativeId,saved.creativeId)
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  console.log(JSON.stringify({ok:true,phase:'review-save-plan',taskId:task.id,artifact:task.artifact,sourceCreativeId:c.sourceCreativeId,receiptId:saved.receipt.id,creativeId:saved.creativeId,usage:task.usage,recommendations:task.recommendations.recommendations,noPublication:true,requestExecutorDrained:true}))
 }else if(phase==='inspect')console.log(JSON.stringify({phase,taskId:task.id,status:task.status,waitingReason:task.waitingReason,inputRequest:task.inputRequest,recommendations:task.recommendations,adoptions:task.adoptions,usage:task.usage}))
 else{
  if(['queued','running','waiting'].includes(task.status))await controlNativeTask(id,id,task.id,{action:'cancel',requestKey:'discovery-acceptance-cleanup'})
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  await prisma.brand.delete({where:{id}});await prisma.user.delete({where:{id}})
  console.log(JSON.stringify({ok:true,phase,fixture:id,retained:['Core task','artifact','ledger','audit']}))
 }
}finally{if(host){const drained=await host.app.runtime.drain({timeoutMs:5000});if(drained.drained)await host.pool.end()}await prisma.$disconnect()}
