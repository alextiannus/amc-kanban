import {prepareVideoScript} from '../src/lib/videoPreparation'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {composeApplication} from '../src/lib/ai-native/application'
import {nativePool,initializeHost,admitIntent,intentForTask} from '../src/lib/ai-native/store'
import {actorFor} from '../src/lib/ai-native/contract'
import {videoDigest,validateVideoArtifact,serializeVideo,type VideoRewriteIntent} from '../src/lib/ai-native/video-rewrite'
import {videoReviewPath} from '../src/lib/ai-native/video-review'
import {prisma} from '../src/lib/prisma'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const pool=nativePool(),id=randomUUID(),actor=actorFor(id,id)
let allowed=true,composition:any,reviewCalls=0,writerCalls=0,reviewMode='pass',attemptedEarlyWrite=false
const usage={inputTokens:100,outputTokens:30}
const intent:VideoRewriteIntent={kind:'video_rewrite',brandId:id,userId:id,goal:'15秒，无口播，连续同一锅，品牌收尾可读；使用导演技能',requestKey:randomUUID(),artifactPath:`work/${id}.json`,script:'Keep my hand-edited pot shot',language:'zh',durationSec:15,editorRevision:'editor-v1',facts:{brand:'Fixture restaurant'},factsDigest:videoDigest({brand:'Fixture restaurant'}),noVoice:true,noOverlay:false,singleSegment:true}
const candidate=(bad:boolean,binding:any=intent)=>({kind:intent.kind,brandId:id,editorRevision:binding.editorRevision,factsDigest:binding.factsDigest,language:'zh',durationSec:15,segments:[{id:'pot',start:0,end:15,visual:'同一锅食物',action:'热气自然升起',spokenText:'',audio:'拟采集现场环境声',camera:[{start:0,end:15,description:'保持镜头稳定',stable:true}],overlays:[{start:bad?14.5:12,end:15,text:'品牌'}],evidenceRefs:['brand'],plannedNeeds:['待拍同一锅连续镜头']}]})
const model={next:async(request:any)=>{
 if(request.billingContext.capability==='amc.video_review'){reviewCalls++;assert(request.messages[0].content.includes('independent'));assert.equal(JSON.parse(request.messages[1].content).calls,undefined);return {type:'finish',result:{issues:reviewMode==='reject'?[{code:'unsupported_claim',severity:'error',location:'pot',message:'Claim lacks evidence'}]:[]},...(reviewMode==='unknown'?{}:{usage})}}
 writerCalls++
 const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=data.calls.filter((c:any)=>c.status==='succeeded')
 const call=(name:string,input:any)=>({type:'call',name,input,usage})
 if(!calls.some((c:any)=>c.capability==='tasks.plan.update'))return call('tasks.plan.update',{id:data.plan.taskId,expectedRevision:0,steps:[{id:'rewrite',description:'Rewrite and verify',status:'in_progress'}]})
 if(!calls.some((c:any)=>c.capability==='amc.context'))return call('amc.context',{})
 if(!attemptedEarlyWrite){attemptedEarlyWrite=true;const binding=calls.find((c:any)=>c.capability==='amc.context').result.intent;return call('my_write_workspace',{path:binding.artifactPath,expectedRevision:0,mediaType:'application/json',content:JSON.stringify(candidate(false,binding))})}
 if(!calls.some((c:any)=>c.capability==='assistant.skills.read'&&!c.input.resource))return call('assistant.skills.read',{id:'amc-creative/SKILL.md'})
 if(!calls.some((c:any)=>c.capability==='assistant.skills.read'&&c.input.resource))return call('assistant.skills.read',{id:'amc-creative/SKILL.md',resource:'references/video-rewrite.md'})
 const requested=calls.find((c:any)=>c.capability==='amc.context').result.requestedCraftResources||[];for(const resource of requested)if(!calls.some((c:any)=>c.capability==='assistant.skills.read'&&c.input.resource===resource))return call('assistant.skills.read',{id:'amc-creative/SKILL.md',resource})
 if(!calls.some((c:any)=>c.capability==='amc.video_facts'))return call('amc.video_facts',{section:'brand',productIds:[]})
 const activeIntent=calls.find((c:any)=>c.capability==='amc.context').result.intent
 const writes=calls.filter((c:any)=>c.capability==='my_write_workspace'),reviews=calls.filter((c:any)=>c.capability==='amc.video_review')
 if(!writes.length)return call('my_write_workspace',{path:activeIntent.artifactPath,expectedRevision:0,mediaType:'application/json',content:JSON.stringify(candidate(true,activeIntent))})
 if(reviews.length<writes.length){const ref=writes.at(-1).result.reference;return call('amc.video_review',{revision:ref.revision,digest:ref.digest})}
 if(reviews.at(-1).result.status==='repair_required')return call('my_write_workspace',{path:activeIntent.artifactPath,expectedRevision:writes.at(-1).result.reference.revision,mediaType:'application/json',content:JSON.stringify(candidate(false,activeIntent))})
 return {type:'finish',result:{summary:'Reviewed',artifacts:[writes.at(-1).result.reference]},usage}
}}
const models={profiles:[{id:'fixture',provider:'openai' as const,model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'fixture',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}}
const options={version:'video-test-v1',skillRoot:process.cwd()+'/skills',authorize:async(a:any)=>allowed&&a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId}
try{
 await initializeHost(pool);composition=await composeApplication(pool,models,options)
 await admitIntent(pool,actor,intent)
 const input={goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composition.tools}
 const [receipt,concurrentReceipt]=await Promise.all([1,2].map(()=>composition.app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})))
 assert.equal(receipt.id,concurrentReceipt.id,'concurrent admission uses one Core task')
 assert.equal((await composition.app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})).id,receipt.id)
 await intentForTask(pool,composition.app,actor,receipt.id)
 await composition.app.runtime.tick()
 const task=await composition.app.runtime.get(actor,receipt.id,{history:true})
 assert.equal(task.status,'succeeded',JSON.stringify({reason:task.waiting_reason,calls:task.calls.map((c:any)=>({tool:c.capability,status:c.status,error:c.error})),events:task.events.slice(-3)}))
 assert(!task.calls.some((c:any)=>c.capability==='my_write_workspace'&&c.status==='unknown'),'missing reads are rejected before dispatch, not an unknown write')
 const reviews=task.calls.filter((c:any)=>c.capability==='amc.video_review');assert.equal(reviews.length,2);assert.equal(reviews[0].result.status,'repair_required');assert.equal(reviews[1].result.status,'passed');assert.notEqual(reviews[0].result.artifactDigest,reviews[1].result.artifactDigest);assert.equal(reviewCalls,1,'program failure does not spend on model review')
 assert.equal((await composition.app.plans.read(actor,{id:receipt.id})).steps.length,1)
 await assert.rejects(()=>composition.app.plans.update(actor,{id:receipt.id,expectedRevision:1,steps:[]},{taskId:randomUUID()}),/own plan/)
 const artifact=await composition.app.workspace.read(actor,task.result.artifacts[0]);assert.equal(validateVideoArtifact(artifact.content,intent).issues.length,0);assert(serializeVideo(JSON.parse(artifact.content)).includes('镜头 1'))
 const bill=await composition.app.ledger.taskUsage(await composition.app.scope(actor),receipt.id);assert.equal(bill.complete,true);assert.equal(Number(bill.platformUnits),(writerCalls+reviewCalls)*130,'independent reviewer is accounted in same task')
 await assert.rejects(()=>composition.app.dispatcher.invoke('amc.video_review',{revision:1,digest:reviews[0].result.artifactDigest},{actor,taskId:receipt.id,callId:randomUUID()}))
 allowed=false;await assert.rejects(()=>composition.app.runtime.get(actor,receipt.id));allowed=true
 await composition.app.close();composition=await composeApplication(pool,models,options)
 assert.equal((await composition.app.runtime.get(actor,receipt.id)).status,'succeeded');assert.equal(JSON.parse((await composition.app.workspace.read(actor,{path:videoReviewPath(receipt.id,2)})).content).status,'passed');assert.equal(reviewCalls,1)
 for(const mode of ['reject','unknown']){
  reviewMode=mode
  const nextIntent={...intent,requestKey:randomUUID(),artifactPath:`work/${randomUUID()}.json`}
  await admitIntent(pool,actor,nextIntent)
  const nextTask=await composition.app.dispatcher.invoke('agent.work',{goal:nextIntent.goal,requiredArtifacts:[nextIntent.artifactPath],allowedTools:composition.tools},{actor,callId:nextIntent.requestKey})
  await intentForTask(pool,composition.app,actor,nextTask.id);await composition.app.runtime.tick()
  const state=await composition.app.runtime.get(actor,nextTask.id,{history:true})
  if(mode==='reject'){
   assert.equal(state.status,'succeeded','completed assessment, not quality pass')
   assert.equal(state.calls.filter((c:any)=>c.capability==='my_write_workspace'&&c.status==='succeeded').length,3,'initial candidate plus at most two repairs')
   assert.equal(JSON.parse((await composition.app.workspace.read(actor,{path:videoReviewPath(nextTask.id,3)})).content).status,'needs_revision')
  }else{
   assert.equal(state.status,'waiting');assert.equal(state.waiting_reason,'external_result')
   const before=reviewCalls;await composition.app.runtime.tick();assert.equal(reviewCalls,before,'unknown spend must not replay')
   assert.equal(JSON.parse((await composition.app.workspace.read(actor,{path:videoReviewPath(nextTask.id,2)})).content).status,'pending')
  }
 }
 // Real legacy API adapter -> same Core task, without provider or media side effects.
 reviewMode='pass'
 await prisma.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
 await prisma.user.create({data:{id,email:`${id}@fixture.invalid`,password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Fixture restaurant',status:'ACTIVE',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 await prisma.modelPolicyRevision.upsert({where:{version:1},create:{version:1,actorId:id,configuration:{defaults:{},exceptions:{}}},update:{}})
 await prisma.modelPolicyState.upsert({where:{id:'default'},create:{id:'default',version:1},update:{version:1}})
 ;(globalThis as any).amcNativeHost=Promise.resolve({pool,app:composition.app,tools:composition.tools,lane:'default',modelRevision:1})
 process.env.AMC_VIDEO_AGENT_BRANDS=id
 const body={action:'rewrite',script:'人工锅物脚本',instructions:intent.goal,language:'zh',targetDurationSec:15,editorRevision:'adapter-v1',requestKey:randomUUID()}
 const [started,concurrentStart]=await Promise.all([1,2].map(()=>prepareVideoScript(id,id,body)))
 assert.equal(started.taskId,concurrentStart.taskId)
 assert(started.taskId)
 for(let n=0;n<100;n++){const state=await composition.app.runtime.state(actor,started.taskId);if(['succeeded','failed','waiting'].includes(state.status))break;await new Promise(r=>setTimeout(r,30))}
 const output=await prepareVideoScript(id,id,body)
 assert.equal(output.status,'ready',JSON.stringify(output));assert.equal(output.taskId,started.taskId);assert.equal(output.baseEditorRevision,'adapter-v1');assert(output.script.includes('镜头 1'))
 const callsBefore=writerCalls+reviewCalls;assert.deepEqual(await prepareVideoScript(id,id,body),output);assert.equal(writerCalls+reviewCalls,callsBefore)
 await assert.rejects(()=>prepareVideoScript(id,id,{...body,script:'changed'}),/request_conflict/)
 reviewMode='unknown'
 const interruptedBody={...body,predecessorTaskId:started.taskId,requestKey:randomUUID()};const interrupted=await prepareVideoScript(id,id,interruptedBody)
 for(let n=0;n<200;n++){if((await composition.app.runtime.state(actor,interrupted.taskId)).status==='waiting')break;await new Promise(r=>setTimeout(r,30))}
 assert.equal(((await intentForTask(pool,composition.app,actor,interrupted.taskId)).intent as any).predecessorTaskId,started.taskId)
 await assert.rejects(()=>prepareVideoScript(id,id,{...body,requestKey:randomUUID(),predecessorTaskId:randomUUID()}),(e:any)=>e.statusCode===404)
 const paused=await prepareVideoScript(id,id,interruptedBody);assert.equal(paused.status,'paused');assert.equal(paused.waitingReason,'external_result');const paidBefore=writerCalls+reviewCalls;await prepareVideoScript(id,id,interruptedBody);assert.equal(writerCalls+reviewCalls,paidBefore,'paused polling never replays inference')
 process.env.AMC_VIDEO_AGENT_BRANDS=''
 assert.deepEqual(await prepareVideoScript(id,id,body),output,'rollback retains original receipt')
 const successor=await composeApplication(pool,models,{...options,version:'video-test-v2',requestExecutorHandoff:true})
 await composition.app.runtime.tick();await successor.app.runtime.tick()
 assert.equal((await successor.app.runtime.deploymentState()).ownsExecutor,true,'new release takes ownership only after old generation drains')
 assert.equal((await composition.app.runtime.deploymentState()).ownsExecutor,false)
 await composition.app.close();composition=successor
 console.log('PASS real videoPreparation adapter: durable task, same-key result, fixed editor revision, changed payload conflict and rollback receipt reuse')
 console.log('PASS: real PostgreSQL/Core admission replay, required Skill reads, deterministic failure → agent repair → independent metered pass, exact digest, revocation and host reopen persistence')
}finally{await composition?.app.close();await pool.end();await prisma.$disconnect()}
