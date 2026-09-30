import { readPreference, changePreference } from '../src/lib/ai-native/preferences.ts'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { composeApplication } from '../src/lib/ai-native/application.ts'
import { nativePool, initializeHost, admitIntent, intentForTask } from '../src/lib/ai-native/store.ts'
import { actorFor, digest, candidateFrom, type CreativeIntent } from '../src/lib/ai-native/contract.ts'
import { prisma } from '../src/lib/prisma.ts'
import { readCreativeRevisions,saveCreativeRevision } from '../src/lib/brand-plan/creativeRevisions.ts'

const url=new URL(process.env.DATABASE_URL||'')
assert.ok(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'),'isolated local database required')
const id='native-test-'+randomUUID(),other='other-'+randomUUID(),pool=nativePool(),actor=actorFor(id,id),month='2099-11'
let composition:any,allowed=true,modelCalls=0,missingUsage=false
const usage={inputTokens:100,outputTokens:30}
const model={next:async(request:any)=>{
 modelCalls++
 if(missingUsage)return {type:'wait',question:'No usage fixture'}
 const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content)
 const host=JSON.parse(request.messages.find((m:any)=>m.content.includes('"hostContext":')).content.split('\n').at(-1)).hostContext.data
 const calls=data.calls.filter((c:any)=>c.status==='succeeded')
 const has=(n:string)=>calls.some((c:any)=>c.capability===n)
 if(!has('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
 if(host.kind==='brand_brief'){
   if(!has('amc.operations'))return {type:'call',name:'amc.operations',input:{},usage}
   if(!has('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:host.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'brand_brief',brandId:id,title:'Current brand work',content:'The current database has no drafts. Prepare a reviewed creative before production.',contextDigest:calls.find((c:any)=>c.capability==='amc.context').result.contextDigest,operationsDigest:calls.find((c:any)=>c.capability==='amc.operations').result.operationsDigest})},usage}
   return {type:'finish',result:{summary:'Evidence-backed brief ready.',artifacts:[calls.find((c:any)=>c.capability==='my_write_workspace').result.reference]},usage}
 }
 if(!has('amc.creative'))return {type:'call',name:'amc.creative',input:{},usage}
 if(!data.events.some((e:any)=>e.kind==='input'))return {type:'wait',question:'请提供希望突出的一项真实卖点。',usage}
 if(!has('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:host.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'creative_candidate',brandId:id,creativeId:'idea',month,expectedRevision:host.expectedRevision,contextDigest:calls.find((c:any)=>c.capability==='amc.context').result.contextDigest,patch:{planning:'手工制作，每日现做'},rationale:'采用用户补充的真实卖点',sourceCreativeId:'cre_fixture',factsUsed:['user clarification: handmade daily']})},usage}
 const ref=calls.find((c:any)=>c.capability==='my_write_workspace').result.reference
 return {type:'finish',result:{summary:'候选已准备，等待用户采用。',artifacts:[ref]},usage}
}}
const models={profiles:[{id:'fixture',provider:'openai' as const,model:'fixture-model',credentialRef:'fixture'}],resolveSecret:()=> 'fixture-not-real',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}}
const options={version:'amc-native-test-v1',authorize:async(a:any)=>allowed&&a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId}
try{
 await prisma.user.create({data:{id,email:`${id}@example.invalid`,nickname:'Native fixture',password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Native fixture',description:'Synthetic long brand context. '.repeat(1000),status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],marketingSolution:{publishingCalendar:{months:{[month]:[{id:'idea',date:'2099-11-15',title:'Original',platform:'Instagram',platformSlug:'instagram',contentType:'image',product:'Fixture',planning:'Original',inspirationCreativeId:'cre_fixture'}]}}}}}}})
 await initializeHost(pool)
 composition=await composeApplication(pool,models,options)
 const first=await readCreativeRevisions({id,type:'HUMAN'},id,month,'idea')
 const intent:CreativeIntent={kind:'creative',userId:id,brandId:id,creativeId:'idea',month,goal:'改写创意，必须先问我希望突出什么卖点。',expectedRevision:first.expectedRevision!,artifactPath:`creative/${id}.json`,requestKey:'native-test-request'}
 const row=await admitIntent(pool,actor,intent)
 await assert.rejects(()=>admitIntent(pool,actor,{...intent,goal:'changed'}),/request_key_reused/)
 await composition.app.ledger.grant(await composition.app.scope(actor),{reference:id,amount:20000,evidence:{test:true}})
 const input={goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composition.tools}
 const receipt=await composition.app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})
 assert.equal((await composition.app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})).id,receipt.id)
 assert.equal((await intentForTask(pool,composition.app,actor,receipt.id)).task_id,receipt.id,'recover lost post-admission application index')
 assert.equal((await readPreference(composition.app,actor)).status,'absent')
 const preference={action:'remember',content:'Use concise, factual wording.',expectedRevision:0}
 assert.equal((await changePreference(composition.app,actor,preference)).revision,1)
 assert.equal((await changePreference(composition.app,actor,preference)).revision,1,'unknown write replay verifies prior result')
 await assert.rejects(()=>readPreference(composition.app,actorFor(id,other)))
 for(let i=0;i<20&&(await composition.app.runtime.state(actor,receipt.id)).status==='queued';i++)await composition.app.runtime.tick()
 let task=await composition.app.runtime.get(actor,receipt.id)
 assert.equal(task.status,'waiting');assert.equal(task.waiting_reason,'input');assert.ok(task.inputRequest.question.includes('卖点'))
 const contextCall=(await composition.app.runtime.get(actor,receipt.id,{history:true})).calls.find((c:any)=>c.capability==='amc.context')
 assert.equal(contextCall.result.evidence.partial,true);assert.ok(JSON.stringify(contextCall.result.knowledge).length<24000)
 await assert.rejects(()=>composition.app.runtime.get(actorFor(id,other),receipt.id))
 await composition.app.close()
 composition=await composeApplication(pool,models,options)
 task=await composition.app.runtime.get(actor,receipt.id);assert.equal(task.status,'waiting')
 assert.equal((await readPreference(composition.app,actor)).content,preference.content)
 assert.equal((await changePreference(composition.app,actor,{action:'forget',expectedRevision:1})).status,'forgotten')
 await assert.rejects(()=>changePreference(composition.app,actor,preference),'old write must not resurrect forgotten preference')
 const control={id:receipt.id,input:'真实卖点是手工制作，每日现做'}
 const resume=await composition.app.dispatcher.invoke('tasks.provide_input',control,{actor,callId:'clarification-request'})
 assert.equal(resume.id,receipt.id)
 await composition.app.runtime.tick()
 task=await composition.app.runtime.get(actor,receipt.id);assert.equal(task.status,'succeeded')
 const competing=await composeApplication(pool,models,options)
 const ownerCalls=modelCalls;await competing.app.runtime.tick();assert.equal(modelCalls,ownerCalls,'second executor must not call model');await competing.app.close()
 const before=modelCalls
 await composition.app.dispatcher.invoke('tasks.provide_input',control,{actor,callId:'clarification-request'})
 assert.equal((await composition.app.runtime.state(actor,receipt.id)).status,'succeeded');assert.equal(modelCalls,before)
 const ref=task.result.artifacts[0],artifact=await composition.app.workspace.read(actor,ref),candidate=candidateFrom(artifact.content,intent)
 const body={expectedRevision:intent.expectedRevision,idempotencyKey:'ai-'+digest([receipt.id,ref.digest]),patch:candidate.patch}
 const provenance={taskId:receipt.id,agentId:'amc-mm-user-ai',requestedBy:id,artifact:ref,contextDigest:candidate.contextDigest}
 const saved=await saveCreativeRevision({id,type:'HUMAN'},id,month,'idea',body,undefined,provenance)
 assert.equal(saved.receipt.origin,'ai_assisted');assert.equal(saved.receipt.ai.taskId,receipt.id)
 assert.equal((await saveCreativeRevision({id,type:'HUMAN'},id,month,'idea',body,undefined,provenance)).receipt.id,saved.receipt.id)
 assert.equal((await composition.app.runtime.get(actor,receipt.id)).status,'succeeded','saved creative must not hide completed task')
 const ledger=await composition.app.ledger.taskUsage(await composition.app.scope(actor),receipt.id);assert.equal(ledger.complete,true);assert.equal(Number(ledger.platformUnits),modelCalls*130)
 allowed=false;await assert.rejects(()=>composition.app.runtime.get(actor,receipt.id));allowed=true
 await prisma.brand.update({where:{id},data:{description:'Facts changed after candidate creation'}})
 const latest=await readCreativeRevisions({id,type:'HUMAN'},id,month,'idea')
 await assert.rejects(()=>saveCreativeRevision({id,type:'HUMAN'},id,month,'idea',{...body,expectedRevision:latest.expectedRevision,idempotencyKey:'changed-brand-facts'},undefined,provenance),(error:any)=>error.code==='brand_context_changed')
 assert.equal((await saveCreativeRevision({id,type:'HUMAN'},id,month,'idea',body,undefined,provenance)).receipt.id,saved.receipt.id,'facts change must not hide existing adoption receipt')
 const next=await readCreativeRevisions({id,type:'HUMAN'},id,month,'idea')
 const uncertain={...intent,requestKey:'unknown-model-request',artifactPath:`creative/${id}-unknown.json`,expectedRevision:next.expectedRevision!}
 await admitIntent(pool,actor,uncertain)
 const unknown=await composition.app.dispatcher.invoke('agent.work',{goal:uncertain.goal,requiredArtifacts:[uncertain.artifactPath],allowedTools:composition.tools},{actor,callId:uncertain.requestKey})
 missingUsage=true;await composition.app.runtime.tick()
 assert.equal((await composition.app.runtime.get(actor,unknown.id)).waiting_reason,'usage_reconciliation')
 const hold=await composition.app.ledger.taskUsage(await composition.app.scope(actor),unknown.id);assert.equal(hold.complete,false);assert.equal(Number(hold.pending),1)
 const count=modelCalls
 await composition.app.dispatcher.invoke('tasks.resume',{id:unknown.id},{actor,callId:'unknown-resume'})
 await composition.app.runtime.tick()
 assert.equal((await composition.app.runtime.get(actor,unknown.id)).waiting_reason,'usage_reconciliation')
 assert.equal(modelCalls,count,'unknown usage must never trigger a repeated provider call')
 await composition.app.dispatcher.invoke('tasks.cancel',{id:unknown.id},{actor,callId:'cancel-unknown'})
 missingUsage=false
 const brief={kind:'brand_brief' as const,brandId:id,userId:id,goal:'Review current work and suggest next steps',artifactPath:`work/${id}-brief.json`,requestKey:'brand-brief-request'}
 await admitIntent(pool,actor,brief)
 const briefReceipt=await composition.app.dispatcher.invoke('agent.work',{goal:brief.goal,requiredArtifacts:[brief.artifactPath],allowedTools:composition.tools.filter((t:string)=>t!=='amc.creative')},{actor,callId:brief.requestKey})
 await composition.app.runtime.tick()
 assert.equal((await composition.app.runtime.get(actor,briefReceipt.id)).status,'succeeded','brand brief must carry verified current evidence')
 assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
 for(const requestKey of ['quota-fourth-request','quota-fifth-request'])await admitIntent(pool,actor,{...brief,requestKey})
 await assert.rejects(()=>admitIntent(pool,actor,{...brief,requestKey:'quota-sixth-request'}),/daily_task_budget_exhausted/)
 console.log(JSON.stringify({ok:true,checks:['Core durable task','recovered application index','scoped persistent preference and forgetting','same admission receipt','bounded partial context','single executor ownership','daily quota bound','brand facts CAS','current permission','cross-user denial','input wait','runtime rebuild','original clarification receipt','candidate verifier','AI provenance','idempotent adoption','post-adoption read','real usage ledger','unknown usage held without retry','cancel','brand brief with operations evidence','no downstream writes'],modelCalls}))
}finally{
 if(composition)await composition.app.close()
 await pool.end()
 await prisma.auditLog.deleteMany({where:{actorId:id}})
 await prisma.brand.deleteMany({where:{id}})
 await prisma.user.deleteMany({where:{id}})
 await prisma.$disconnect()
}
