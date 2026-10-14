import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Pool} from 'pg'
import {openPlatformTeam} from '../src/lib/platform-ai/team-application.mjs'
import {initializeBugReports,saveBugReport,readBugReport} from '../src/lib/platform-ai/bug-report-store.ts'
import {engineeringCapabilities,PLATFORM_ACTOR,REVIEW_ACTOR} from '../src/lib/platform-ai/engineering-capabilities.ts'
import {encryptSecret} from '../src/lib/model-management/secrets.ts'
import {sourcePath,validatePatch} from '../src/lib/platform-ai/engineering-policy.ts'
import {operation} from '../src/lib/platform-ai/engineering-store.ts'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
process.env.MODEL_CONFIG_ENCRYPTION_KEY='a'.repeat(64)
const pool=new Pool({connectionString:url.toString()}),schema='platform_test_'+randomUUID().replaceAll('-',''),user=randomUUID(),base='a'.repeat(40),sha='b'.repeat(40)
let app:any,taskPool:Pool|undefined,reportId='',patches=0,dispatches=0,pushes=0,reviews=0
try{
 const template=await readFile('node_modules/@immedi/iaic-core/examples/core-platform-team/application.mjs','utf8')
 assert.equal(await readFile('src/lib/platform-ai/team-application.mjs','utf8'),template.replace('modelFactory,workCapabilities=[]})','modelFactory,workCapabilities=[],executionPolicy})').replace('new CapabilityDispatcher({capabilities:[...nativeTools,agent]})','new CapabilityDispatcher({capabilities:[...nativeTools,agent],executionPolicy})').replace('new AgentRuntime({maxBatchCalls:4,','new AgentRuntime({maxTurns:40,maxCalls:48,maxBatchCalls:1,modelTimeoutMs:110000,taskTimeoutMs:600000,').replace('return {dispatcher:publicDispatcher,runtime,self,','return {dispatcher:publicDispatcher,runtime,tasks,self,'))
 for(const path of ['../secrets.ts','src/../a.ts','src/lib/auth.ts','src/lib/platform-ai/worker.ts','src/app/api/admin/route.ts','src/lib/ai-native/application.ts','scripts/configure-platform-engineering.mts'])assert.throws(()=>sourcePath(path,true))
 assert.equal(sourcePath('src/components/companion/CompanionTextChat.tsx',true),'src/components/companion/CompanionTextChat.tsx')
 await initializeBugReports(pool)
 await pool.query("INSERT INTO public.amc_platform_settings(id,encrypted_config) VALUES('engineering-v1',$1) ON CONFLICT(id) DO UPDATE SET encrypted_config=excluded.encrypted_config",[encryptSecret(JSON.stringify({enabled:true,githubToken:'fixture-only'}))])
 reportId=(await saveBugReport(pool,user,'fixture-brand',{goal:'/bug fixture function adds incorrectly',requestKey:randomUUID(),history:[]})).id
 await pool.query(`CREATE SCHEMA ${schema}`);taskPool=new Pool({connectionString:url.toString(),options:`-c search_path=${schema}`})
 const fakeGitHub:any={head:async()=>base,tree:async()=>['src/example.ts'],source:async()=>({path:'src/example.ts',ref:base,content:'export const add=(a,b)=>a-b'}),patch:async(_report:any,_id:any,input:any)=>{patches++;return {repo:input.repo,base,sha,branch:'fixture',testPath:'scripts/platform-regressions/'+reportId+'.test.mts'}},checks:async(_patch:any,_id:any,dispatch:boolean)=>{if(dispatch)dispatches++;return {ready:true,passed:true,runId:1,sha,conclusion:'success'}},publish:async()=>{pushes++;return {repo:'amc-mm',sha,pushed:true}}}
 const capabilities=engineeringCapabilities(pool,()=>app,{github:()=>fakeGitHub,review:async()=>{reviews++;return {verdict:'no_findings',findings:'Fixture independent review',usage:{input_tokens:4,output_tokens:2}}},deployed:async()=>({ready:true,sha,origin:'fixture'})})
 const modelFactory=()=>({next:async({messages}:any)=>{
  const c=JSON.parse(messages[1].content),calls=c.calls.filter((call:any)=>call.status==='succeeded'),find=(name:string)=>calls.find((call:any)=>call.capability==='engineering.'+name)?.result
  let name,input:any={reportId}
  if(!find('context'))name='context'
  else if(!find('source')){name='source';input={...input,repo:'amc-mm',ref:base,path:'src/example.ts'}}
  else if(!find('patch')){name='patch';input={...input,repo:'amc-mm',base,files:[{path:'src/example.ts',content:'export const add=(a,b)=>a+b'}],test:"import assert from 'node:assert/strict'; import {add} from '../../src/example.ts'; assert.equal(add(2,1),3)"}}
  else if(!find('check_start')){name='check_start';input.checkOperationId=undefined;input.patchOperationId=find('patch').operationId;delete input.checkOperationId}
  else if(!find('check_status')){name='check_status';input.checkOperationId=find('check_start').operationId}
  else if(!find('review')){name='review';input.checkOperationId=find('check_start').operationId}
  else if(!find('publish')){name='publish';input.reviewOperationId=find('review').operationId}
  else if(!find('release_status')){name='release_status';input.publishOperationId=find('publish').operationId}
  else return {type:'finish',result:{summary:'fixture repair',artifacts:[]},usage:{inputTokens:2,outputTokens:1}}
  return {type:'call',name:'engineering.'+name,input,usage:{inputTokens:2,outputTokens:1}}
 }})
 app=await openPlatformTeam({pool:taskPool,applicationId:PLATFORM_ACTOR.scopeId,teamId:'amc',builtinActor:PLATFORM_ACTOR,authorizeMember:(actor:any)=>[PLATFORM_ACTOR.subjectId,REVIEW_ACTOR.subjectId].includes(actor.subjectId),profile:{id:'system',provider:'openai',model:'fixture',credentialRef:'fixture'},resolveSecret:()=> 'fixture-only',modelFactory,tokenPolicy:{maximum:100,price:{revision:'fixture',input:1,cachedInput:1,output:1}},version:'fixture-v1',skillRoot:process.cwd()+'/skills',workCapabilities:capabilities,verifyOutcome:async()=> (await readBugReport(pool,user,'fixture-brand',reportId)).status==='fixed'})
 await app.ledger.grant(app.budgetScope,{reference:'fixture',amount:10000,evidence:{fixture:true}})
 const request={requestId:reportId,goal:`Report ID: ${reportId}\nTest`}
 const receipt=await app.dispatcher.invoke('platform.team.request',request,{actor:PLATFORM_ACTOR,callId:'fixture-request'})
 assert.equal((await app.dispatcher.invoke('platform.team.request',request,{actor:PLATFORM_ACTOR,callId:'fixture-retry'})).task.id,receipt.task.id)
 // Intentionally do not write task_id; first trusted tool must recover the report binding.
 for(let i=0;i<20;i++){await app.runtime.tick();const state=await app.runtime.state(PLATFORM_ACTOR,receipt.task.id);if(state.status==='succeeded')break;if(['failed','paused','waiting'].includes(state.status))console.log('STATE',state.status,state.waiting_reason)}
 const terminal=await app.runtime.get(PLATFORM_ACTOR,receipt.task.id,{history:true})
 if(terminal.status!=='succeeded')console.log(JSON.stringify({status:terminal.status,events:terminal.events,calls:terminal.calls.map((c:any)=>({name:c.capability,status:c.status,error:c.error}))}))
 assert.equal(terminal.status,'succeeded');assert.equal((await readBugReport(pool,user,'fixture-brand',reportId)).status,'fixed')
 assert.deepEqual([patches,dispatches,reviews,pushes],[1,1,1,1])
 await assert.rejects(()=>app.dispatcher.invoke('engineering.context',{reportId},{actor:{...PLATFORM_ACTOR,subjectId:'ordinary-user'},taskId:receipt.task.id}),/denied/i)
 let attempts=0
 await assert.rejects(()=>operation(pool,reportId,'lost',{x:1},async()=>{attempts++;throw Error('lost')}),/lost/)
 const recovered=await operation(pool,reportId,'lost',{x:1},async(_id,recover)=>{assert(recover);return {recovered:true}})
 assert.equal(attempts,1);assert(recovered.recovered)
 console.log('PASS real IAIC TaskStore/Runtime, native identity, receipt retry/index recovery, bound source/patch/test/review/publish flow, Core PeerReviews and independent usage. GitHub, deployment and models are deterministic test adapters.')
}finally{
 await app?.close();await taskPool?.end();await pool.query('DELETE FROM public.amc_platform_operations WHERE report_id=$1',[reportId||randomUUID()]);await pool.query('DELETE FROM public.amc_bug_reports WHERE user_id=$1',[user]);await pool.query("DELETE FROM public.amc_platform_settings WHERE id='engineering-v1'");await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await pool.end();await prisma.$disconnect()
}
