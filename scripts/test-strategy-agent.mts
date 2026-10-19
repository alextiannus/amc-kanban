import {createApiKeyToken,hashApiKeyToken} from '../src/lib/auth-v2/api-key.ts'
import {GET as runtimeGET} from '../src/app/api/brands/[id]/ai/runtime/route.ts'
import {GET as inspectionGET} from '../src/app/api/brands/[id]/ai/tasks/[taskId]/inspection/route.ts'
import {POST as tasksPOST} from '../src/app/api/brands/[id]/ai/tasks/route.ts'
import {changePreference} from '../src/lib/ai-native/preferences.ts'
import {changeAgentSkill,readAgentSkill} from '../src/lib/agent-skills/store.ts'
import {USER_AI} from '../src/lib/agent-skills/catalog.ts'
import {inspectAssistantHistory,inspectAssistantUsage} from '../src/lib/ai-native/assistant-inspection.ts'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {Pool} from 'pg'
import {prisma} from '../src/lib/prisma.ts'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost} from '../src/lib/ai-native/store.ts'
import {actorFor,conversationInput} from '../src/lib/ai-native/contract.ts'
import {marketingPlanShape,planningRevision} from '../src/lib/ai-native/planning-workspace-contract.ts'
import {savePlanningDocument} from '../src/lib/ai-native/planning-document.ts'
import {savePlanningDraft} from '../src/lib/ai-native/planning-workspace-save.ts'
import {createNativeTask,readNativeTaskStatus,readNativeTask,nativeConversations,strategyVersions,finalizePlanningTasks,controlNativeTask,inspectNativeTask,nativeAssistantRuntime,listNativeTasks} from '../src/lib/ai-native/service.ts'
import {activeConversationStatus} from '../src/lib/ai-native/conversation-status.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const id=randomUUID(),actor=actorFor(id,id),session=randomUUID(),pool=nativePool(),taskPool=nativePool(process.env.DATABASE_URL,'conversation')
const usage={inputTokens:10,outputTokens:10};let chat:any,bg:any,gate:any,entered:any,hold=false,modelCalls=0,expectedPreference:string|null|undefined
const next=async(request:any)=>{
 modelCalls++
 if(hold){hold=false;entered();await gate}
 const input=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=input.calls.filter((c:any)=>c.status==='succeeded'),find=(name:string)=>calls.findLast((c:any)=>c.capability===name)
 if(!find('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
 const ctx=find('amc.context').result
 if(expectedPreference!==undefined)assert.equal(ctx.workingPreference.content,expectedPreference,'current explicit preference loaded on every task')
 if(!find('my_write_workspace')){
  const data=marketingPlanShape('2026-10');data.strategyFramework.summary=[ctx.intent.goal]
  if(ctx.intent.afterTaskId){assert(ctx.previousTurn.reply,'follow-up receives the previous verified response');assert.equal(ctx.previousTurn.planningSave.verified,true,'predecessor is automatically saved before follow-up sources load')}
  return {type:'call',name:'my_write_workspace',input:{path:ctx.intent.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'conversation',brandId:id,content:'Strategy result: '+ctx.intent.goal,contextDigest:ctx.contextDigest,planningProgress:{stage:'marketing_plan',summary:ctx.intent.goal},planningDraft:{scope:ctx.intent.planningScope,expectedRevision:ctx.planningContext.workspace.revision,title:'品牌营销策略',content:'策略摘要',data}})},usage}
 }
 return {type:'finish',result:{summary:'Prepared',artifacts:[find('my_write_workspace').result.reference]},usage}
}
const models:any={profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'fixture',modelFactory:()=>({next}),tokenPolicies:{fixture:{maximum:1000,price:{revision:'fixture',input:1,cachedInput:1,output:1}}}}
const options={version:'strategy-agent-fixture',authorize:async(a:any)=>a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,readContext:async()=>({brand:{id,name:'Strategy fixture'},productCatalog:[]}),readMarketingWorkspace:async()=>{const k=await prisma.brandKnowledge.findUnique({where:{brandId:id}});const workspace=k?.marketingSolution||{};return {brandId:id,status:'available' as const,revision:planningRevision(workspace),workspace}},readInsight:async()=>({source:'AMC Growth',brandId:id,retrievedAt:new Date().toISOString(),status:'missing',report:null}),readUiPages:async()=>({})}
const body=(goal:string,extra:any={})=>({kind:'conversation',topic:'brand_planning',conversationId:session,contextSessionId:session,autoSavePlanning:true,planningScope:{stage:'marketing_plan',mode:'draft',startMonth:'2026-10'},goal,requestKey:randomUUID(),history:[],...extra})
const finish=async(id:string)=>{for(let i=0;i<100;i++){const s=await chat.app.runtime.state(actor,id);if(['succeeded','failed','cancelled','waiting'].includes(s.status))return s;await new Promise(r=>setTimeout(r,30))}throw Error('fixture timeout')}
try{
 await prisma.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
 await prisma.modelPolicyRevision.upsert({where:{version:1},create:{version:1,actorId:id,configuration:{defaults:{},exceptions:{}}},update:{}})
 await prisma.modelPolicyState.upsert({where:{id:'default'},create:{id:'default',version:1},update:{version:1}})
 await prisma.user.create({data:{id,email:`${id}@fixture.invalid`,password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Strategy fixture',status:'ACTIVE',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 await initializeHost(pool);await pool.query('CREATE SCHEMA IF NOT EXISTS amc_iaic_conversation')
 bg=await composeApplication(pool,models,options);chat=await composeApplication(pool,models,{...options,taskPool})
 ;(globalThis as any).amcNativeHost=Promise.resolve({pool,app:bg.app,tools:bg.tools,lane:'default',modelRevision:1})
 ;(globalThis as any).amcConversationHost=Promise.resolve({pool,taskPool,app:chat.app,tools:chat.tools,lane:'conversation',modelRevision:1})
 const firstBody=body('Focus on families'),first=await createNativeTask(id,id,firstBody)
 assert.equal((await finish(first.id)).status,'succeeded')
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id}}),0,'generation is distinct from committed strategy')
 await finalizePlanningTasks() // No browser result polling.
 const saved=await readNativeTask(id,id,first.id)
 assert(saved.planningSave?.verified,JSON.stringify(saved.planningSave));assert.equal(saved.planningSave.version,1)
 assert.equal((await createNativeTask(id,id,firstBody)).id,first.id)
 await finalizePlanningTasks();assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id}}),1,'lost receipt replays without a duplicate version')
 let release:any;gate=new Promise(r=>release=r);const started=new Promise(r=>entered=r);hold=true
 const second=await createNativeTask(id,id,body('Reduce budget by 30%'));await started
 const status=await readNativeTaskStatus(id,id,second.id);assert.equal(status.status,'running');assert(!('report' in status),'progress never exposes raw model or tool payloads')
 const third=await createNativeTask(id,id,body('Keep the positioning; change channels only',{afterTaskId:second.id}))
 release();await chat.app.runtime.tick();assert.equal((await finish(second.id)).status,'succeeded');await chat.app.runtime.tick();assert.equal((await finish(third.id)).status,'succeeded')
 await finalizePlanningTasks();assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id}}),3)
 const old=await readNativeTask(id,id,first.id);assert.equal(old.planningSave.current,false);assert.equal(old.planningSave.version,1)
 const history=await nativeConversations(id,id,session);assert.equal(history.items.length,3);assert(history.items[0].task.report.content.includes('Focus on families'))
 assert.equal((await nativeConversations(id,id)).items[0].id,session)
 assert.equal((await strategyVersions(id,id)).items[0].version,3)
 await assert.rejects(()=>nativeConversations(id,'other',session))
 await assert.rejects(()=>createNativeTask(id,id,body('Wrong session',{conversationId:randomUUID(),afterTaskId:first.id})),(e:any)=>e.statusCode===409)
 const oldDraft=(saved.report as any).planningDraft
 await assert.rejects(()=>savePlanningDraft(id,id,randomUUID(),oldDraft),(e:any)=>e.statusCode===409)
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id}}),3,'conflict cannot overwrite the latest strategy')
 const cancelled=await createNativeTask(id,id,body('Stop before completion'))
 const stop=await controlNativeTask(id,id,cancelled.id,{action:'cancel',requestKey:randomUUID()});assert.equal(stop.task.status,'cancelled');await finalizePlanningTasks()
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId:id}}),3)
 // A manual edit retains old lineage IDs but is still a newer version.
 const current=(await prisma.brandKnowledge.findUnique({where:{brandId:id}}))!.marketingSolution as any
 await savePlanningDocument(id,id,{stage:'marketing_plan',action:'save',content:'Manually refined strategy',expectedRevision:planningRevision(current),requestKey:randomUUID()})
 assert.equal((await readNativeTask(id,id,third.id)).planningSave.current,false)
 assert((await strategyVersions(id,id)).items[0].changes.includes('content'))
 const other=randomUUID();await prisma.user.create({data:{id:other,email:`${other}@fixture.invalid`,password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.update({where:{id},data:{crew:{update:{members:{create:{userId:other,role:'PRINCIPAL'}}}}}})
 assert.deepEqual((await nativeConversations(other,id)).items,[])
 await assert.rejects(()=>nativeConversations(other,id,session),(e:any)=>e.statusCode===404)
 assert.equal((await nativeConversations(id,id,undefined,undefined,'families')).items.length,1)
 assert.equal((await nativeConversations(id,id,undefined,undefined,'no-match')).items.length,0)
 // A lost index acknowledgement repairs from the original Core binding.
 await pool.query('UPDATE amc_ai_requests SET task_id=NULL WHERE task_id=$1',[first.id])
 assert.equal((await nativeConversations(id,id,session)).items.length,4)
 for(let i=0;i<8;i++){const task=await createNativeTask(id,id,body('Iteration '+i));assert.equal((await finish(task.id)).status,'succeeded');await finalizePlanningTasks()}
 const newest=await nativeConversations(id,id,session);assert.equal(newest.items.length,10);assert(newest.nextCursor)
 const earlier=await nativeConversations(id,id,session,newest.nextCursor);assert.equal(earlier.items.length,2)
 assert.equal(new Set([...newest.items,...earlier.items].map(i=>i.taskId)).size,12)
 const state={id:'x',status:'running',input:{goal:'work'},version:'v'}
 const projected=await activeConversationStatus({runtime:{state:async()=>state},tasks:{operationReceipts:async()=>[{capability:'amc.context',status:'succeeded'}]}} as any,actor,'x','conversation');assert.equal(projected?.progress.stage,'reply')
 assert.throws(()=>conversationInput({conversationId:'bad'}));assert.throws(()=>conversationInput({afterTaskId:'bad'}))
 const inspection=await inspectNativeTask(id,id,first.id)
 assert(inspection.tools.some(t=>t.name==='amc.context'));assert.equal(inspection.artifacts.length,1);assert.equal(inspection.usage.complete,true);assert(Number(inspection.usage.providerTokens)>0)
 assert(!JSON.stringify(inspection).includes('Strategy result:'));assert(!JSON.stringify(inspection).includes('rationale'))
 await assert.rejects(()=>inspectNativeTask(other,id,first.id));await assert.rejects(()=>inspectNativeTask(id,'other',first.id))
 assert((await listNativeTasks(id,id)).page.items.some((t:any)=>t.conversationId===session))
 const runtime=await nativeAssistantRuntime(id,id);assert(runtime.skills.every(s=>!('content' in s)));assert.equal(runtime.usagePolicy.enforced,false)
 // Exercise actual route handlers, authentication and temporary database together.
 const token=createApiKeyToken(),otherToken=createApiKeyToken()
 const key=await prisma.userApiKey.create({data:{userId:id,tokenHash:hashApiKeyToken(token),prefix:token.slice(0,12),name:'route fixture',lastUsedAt:new Date()}})
 await prisma.userApiKey.create({data:{userId:other,tokenHash:hashApiKeyToken(otherToken),prefix:otherToken.slice(0,12),name:'other fixture',lastUsedAt:new Date()}})
 const req=(credential?:string,init:RequestInit={})=>new Request(`http://localhost/api/brands/${id}/ai/runtime`,{...init,headers:{...(credential?{authorization:`Bearer ${credential}`} : {}),...init.headers}})
 const params={params:Promise.resolve({id})},taskParams={params:Promise.resolve({id,taskId:first.id})}
 assert.equal((await runtimeGET(req(),params)).status,401)
 const routeRuntime=await runtimeGET(req(token),params);assert.equal(routeRuntime.status,200);assert.equal(routeRuntime.headers.get('cache-control'),'no-store')
 assert.equal((await inspectionGET(req(token),taskParams)).status,200)
 assert.equal((await inspectionGET(req(otherToken),taskParams)).status,404)
 assert.equal((await runtimeGET(req(token),{params:Promise.resolve({id:randomUUID()})})).status,403)
 const beforeRouteCalls=modelCalls
 assert.equal((await tasksPOST(req(token,{method:'POST',headers:{'sec-fetch-site':'cross-site'},body:JSON.stringify(firstBody)}),params)).status,403)
 const replayResponse=await tasksPOST(req(token,{method:'POST',body:JSON.stringify(firstBody)}),params)
 assert.equal(replayResponse.status,202);assert.equal((await replayResponse.json()).id,first.id)
 assert.equal(modelCalls,beforeRouteCalls,'route replay and rejected writes never regenerate')
 await prisma.userApiKey.update({where:{id:key.id},data:{revokedAt:new Date()}})
 assert.equal((await runtimeGET(req(token),params)).status,401)
 console.log('PASS: real route/auth/database integration: anonymous and revoked credentials, no-store, owner and brand isolation, cross-site write rejection, original task replay without model calls')
 const originalSkill=await readAgentSkill(USER_AI,'amc-marketing-expert/SKILL.md')
 await assert.rejects(()=>changeAgentSkill({agentId:USER_AI,skillId:originalSkill.id,action:'save',content:originalSkill.content+'custom change',expectedVersion:originalSkill.version},id),(e:any)=>e.statusCode===400)
 const removed=await changeAgentSkill({agentId:USER_AI,skillId:originalSkill.id,action:'uninstall',expectedVersion:originalSkill.version},id)
 const callsBefore=modelCalls
 await assert.rejects(()=>createNativeTask(id,id,body('Missing required skill')),(e:any)=>e.code==='required_skill_not_installed')
 assert.equal(modelCalls,callsBefore,'missing skill consumes no model invocation')
 assert.equal((await createNativeTask(id,id,firstBody)).id,first.id,'installed-state changes do not duplicate accepted tasks')
 await changeAgentSkill({agentId:USER_AI,skillId:originalSkill.id,action:'save',content:originalSkill.content,expectedVersion:removed.version},id)
 const pref=await changePreference(chat.app,actor,{action:'remember',content:'Keep replies concise',expectedRevision:0});expectedPreference='Keep replies concise'
 const memoryTask=await createNativeTask(id,id,body('Read explicit preference'));assert.equal((await finish(memoryTask.id)).status,'succeeded')
 assert.equal((await inspectNativeTask(id,id,memoryTask.id)).preference?.revision,pref.revision)
 await changePreference(chat.app,actor,{action:'forget',expectedRevision:pref.revision});expectedPreference=null
 const forgottenTask=await createNativeTask(id,id,body('Use current preference'));assert.equal((await finish(forgottenTask.id)).status,'succeeded')
 const sanitized=inspectAssistantHistory([{capability:'tool',status:'failed',input:{secret:'never-expose'},result:{private:'never-expose'},error:'never-expose'}],[{path:'other-secret',revision:1,digest:'never-expose'}],'work/allowed')
 assert(!JSON.stringify(sanitized).includes('never-expose'));assert.equal(inspectAssistantUsage({providerTokens:undefined}).providerTokens,null)
 console.log('PASS: task inspection owner/brand isolation, tool payload redaction, fixed artifact, measured usage, task conversation binding, required Skill uninstall/reinstall and admission preflight, explicit memory edit/forget read by model')
 console.log('PASS: real PostgreSQL/Core generation, server autosave without browser, committed version readback, replay, queued follow-up, predecessor save, immutable history, cloud restore, user/brand isolation, conflict preservation, cancellation, factual progress')
}finally{if(chat)await chat.app.close();if(bg)await bg.app.close();await taskPool.end();await pool.end();await prisma.$disconnect()}
