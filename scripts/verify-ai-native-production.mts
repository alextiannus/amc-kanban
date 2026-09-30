// Explicit, bounded acceptance using a labelled archived synthetic brand.
// It never publishes, produces paid media, changes a real brand, or grants roles.
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {setTimeout as delay} from 'node:timers/promises'
import {prisma} from '../src/lib/prisma.ts'
import {createNativeTask,readNativeTask,controlNativeTask,adoptNativeCandidate,getNativeHost,nativePreference} from '../src/lib/ai-native/service.ts'
import {readCreativeRevisions} from '../src/lib/brand-plan/creativeRevisions.ts'
import {actorFor,CORE_VERSION} from '../src/lib/ai-native/contract.ts'

const [phase,id]=process.argv.slice(2)
assert.ok(process.argv.includes('--production-acceptance')&&process.env.RENDER,'Explicit Render acceptance required')
assert.ok(['prepare','complete','brief','inspect','cleanup'].includes(phase)&&/^amc-native-acceptance-[a-z0-9-]{8,50}$/.test(id||''),'Labelled acceptance ID required')
const month='2099-11',actor=actorFor(id,id),key='production-creative-acceptance-v1'
const goal='This is a synthetic acceptance task. Read the brand and selected creative. First ask me ONE question about the target audience using iaic_wait, even if you can guess it. After my answer, rewrite only planning for that audience, preserving product facts. Produce the required JSON candidate, read it back, then finish. No publication or other business action is requested.'
let host:Awaited<ReturnType<typeof getNativeHost>>|undefined
async function originalTask(){host=await getNativeHost();const store=host.app.tasks as {findRequest(a:typeof actor,c:string,k:string):Promise<{id:string}|null>};const result=await store.findRequest(actor,'agent.work',key);assert.ok(result,'Original task required');return result.id}
async function waitFor(taskId:string,predicate:(task:any)=>boolean){const end=Date.now()+215000;while(Date.now()<end){const task=await readNativeTask(id,id,taskId);if(predicate(task))return task;if(['failed','cancelled'].includes(task.status)||(task.status==='waiting'&&task.waitingReason!=='input'))throw new Error(`Acceptance task stopped: ${task.status}/${task.waitingReason}`);await delay(1500)}throw new Error('Acceptance wait timed out; inspect original task before retrying')}
try{
 if(phase==='prepare'){
  if(!await prisma.user.findUnique({where:{id}}))await prisma.user.create({data:{id,email:`${id}@example.invalid`,nickname:'AMC AI acceptance fixture',password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
  if(!await prisma.brand.findUnique({where:{id}}))await prisma.brand.create({data:{id,name:'AMC AI acceptance fixture (archived)',description:'Synthetic test only. Handmade lunch sandwiches. No price, promotion or external publication is authorized.',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],brandTone:'Clear and factual',marketingSolution:{publishingCalendar:{months:{[month]:[{id:'acceptance-idea',date:'2099-11-15',title:'Handmade lunch sandwiches',platform:'Instagram',platformSlug:'instagram',contentType:'image',product:'Handmade sandwiches',planning:'Present the handmade lunch sandwiches.',inspirationCreativeId:'cre_acceptance_source'}]}}}}}}})
  const source=await readCreativeRevisions({id,type:'HUMAN'},id,month,'acceptance-idea')
  const preference=await nativePreference(id,id)
  if(preference.revision===0)await nativePreference(id,id,{action:'remember',expectedRevision:0,content:'Use concise English wording and do not invent price or promotions.'})
  const receipt=await createNativeTask(id,id,{kind:'creative',creativeId:'acceptance-idea',month,expectedRevision:source.expectedRevision,goal,requestKey:key})
  const task=await waitFor(receipt.id,t=>t.status==='waiting'&&!!t.inputRequest)
  console.log(JSON.stringify({ok:true,phase,core:CORE_VERSION,fixture:id,taskId:task.id,status:task.status,waitingReason:task.waitingReason,question:task.inputRequest.question,usage:task.usage}))
 }else if(phase==='complete'){
  const taskId=await originalTask(),before=await readNativeTask(id,id,taskId)
  if(before.status==='waiting'&&before.inputRequest)await controlNativeTask(id,id,taskId,{action:'provide_input',input:'The audience is families choosing lunch together. Use only the existing facts about handmade sandwiches. No promotions, prices or new product claims. Please now complete the candidate.',requestKey:'production-audience-answer-v1'})
  const task=await waitFor(taskId,t=>t.status==='succeeded')
  assert.ok(task.candidate&&task.artifact&&task.usage.complete)
  const body={requestKey:'production-adoption-v1',artifactDigest:task.artifact.digest}
  const saved=await adoptNativeCandidate(id,id,taskId,body),replayed=await adoptNativeCandidate(id,id,taskId,body)
  assert.equal(saved.receipt.id,replayed.receipt.id);assert.equal(saved.verified,true)
  const history=await readCreativeRevisions({id,type:'HUMAN'},id,month,'acceptance-idea',saved.receipt.id)
  assert.equal(history.revisions[0].ai.taskId,taskId);assert.equal(history.revisions[0].source.creativeId,'cre_acceptance_source')
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  console.log(JSON.stringify({ok:true,phase,core:CORE_VERSION,fixture:id,taskId,status:task.status,artifact:task.artifact,usage:task.usage,receiptId:saved.receipt.id,revision:saved.receipt.revision,actualActor:saved.receipt.actor?.id,sourceCreativeId:history.revisions[0].source.creativeId,verified:true,noPublication:true,patch:task.candidate.patch}))
 }else if(phase==='brief'){
  host=await getNativeHost()
  assert.equal((await host.app.runtime.drain({timeoutMs:5000})).drained,true)
  const receipt=await createNativeTask(id,id,{kind:'brand_brief',goal:'Prepare a concise English brand work brief: read current brand facts and operations, report recorded draft status counts and propose two sensible next steps. Explicitly label missing data as unknown. Do not ask questions or execute proposals. Write the required JSON report and finish with its exact reference.',requestKey:'production-brand-brief-v2'})
  const task=await waitFor(receipt.id,t=>t.status==='succeeded')
  assert.ok(task.report&&task.artifact&&task.usage.complete)
  assert.equal(task.currentOperations?.draftTotal,0);assert.equal(task.currentOperations?.accountTotal,0);assert.equal(task.currentOperations?.changed,false)
  assert.ok(!/[a-f0-9]{64}|amc\.(context|operations)/.test(task.report.content),'User-facing report must not expose internal digests or tool names')
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  console.log(JSON.stringify({ok:true,phase:'brand-brief-server-worker',requestProcessExecutorDrained:true,taskId:task.id,usage:task.usage,artifact:task.artifact,currentOperations:task.currentOperations,report:task.report,noDownstreamWrites:true}))
 }else if(phase==='inspect'){
  const taskId=await originalTask(),task=await readNativeTask(id,id,taskId)
  console.log(JSON.stringify({phase,fixture:id,taskId,status:task.status,waitingReason:task.waitingReason,inputRequest:task.inputRequest,usage:task.usage,result:task.result}))
 }else{
  const taskId=await originalTask(),task=await readNativeTask(id,id,taskId)
  if(['queued','running','waiting'].includes(task.status))await controlNativeTask(id,id,taskId,{action:'cancel',requestKey:'production-acceptance-cleanup'})
  assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
  const history=await readCreativeRevisions({id,type:'HUMAN'},id,month,'acceptance-idea')
  const revision=history.revisions[0]
  if(revision?.ai){assert.equal(revision.actor.id,id);assert.equal(revision.brand.id,id);assert.ok(revision.principals.some((p:any)=>p.userId===id));assert.equal(revision.ai.requestedBy,id);assert.equal(revision.source.creativeId,'cre_acceptance_source')}
  await prisma.brand.delete({where:{id}});await prisma.user.delete({where:{id}})
  // Core task/artifact/usage evidence and audit history are intentionally retained.
  console.log(JSON.stringify({ok:true,phase,fixture:id,retained:['Core task','usage ledger','artifact','audit history']}))
 }
}finally{
 host=host||await getNativeHost().catch(()=>undefined)
 if(host){const result=await host.app.runtime.drain({timeoutMs:5000});if(result.drained)await host.pool.end()}
 await prisma.$disconnect()
}
