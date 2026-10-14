import {changePreference,readPreference} from '../src/lib/ai-native/preferences.ts'
import {readNativeTask,readNativeTaskStatus,listNativeTasks,createNativeTask,controlNativeTask} from '../src/lib/ai-native/service.ts'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {readFile} from 'node:fs/promises'
import {Pool} from 'pg'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent,intentForTask} from '../src/lib/ai-native/store.ts'
import {actorFor,digest,type ConversationIntent} from '../src/lib/ai-native/contract.ts'
import {laneCursors,nextLaneCursor} from '../src/lib/ai-native/runtime-routing.ts'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const upstream=await readFile('node_modules/@immedi/iaic-core/developer/templates/agent/app.mjs','utf8')
assert.equal(await readFile('src/lib/ai-native/runtime-application.mjs','utf8'),'// Application-owned composition of public Core modules; upstream template with TaskStore pool injection only.\n'+upstream.replace('export async function openApplication({pool,','export async function openApplication({pool,taskPool=pool,').replace('tasks=new TaskStore({pool});','tasks=new TaskStore({pool:taskPool});'))
assert.deepEqual(laneCursors(),{default:undefined,conversation:undefined})
assert.deepEqual(laneCursors('old-cursor'),{default:'old-cursor',conversation:null})
assert.deepEqual(laneCursors(nextLaneCursor({default:null,conversation:'next'})!),{default:null,conversation:'next'})
assert.equal(nextLaneCursor({default:null,conversation:null}),null)
assert.throws(()=>laneCursors('lanes.not-json'),/invalid_task_cursor/)
const id=randomUUID(),actor=actorFor(id,id),pool=nativePool(),schema='test_conversation_'+id.replaceAll('-','')
const taskPool=new Pool({connectionString:process.env.DATABASE_URL,max:8,options:`-c search_path=${schema} -c statement_timeout=30000`})
let background:any,conversation:any,release!:()=>void,entered!:()=>void,blocked=true
const gate=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r)
const usage={inputTokens:10,outputTokens:10}
const next=async(request:any)=>{
 const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=data.calls.filter((c:any)=>c.status==='succeeded'),find=(name:string)=>calls.findLast((c:any)=>c.capability===name)
 if(!find('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
 const ctx=find('amc.context').result
 if(!find('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:ctx.intent.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'conversation',brandId:id,content:'A coherent recommendation based on your current brand.',contextDigest:ctx.contextDigest,planningProgress:{stage:'focus',summary:'Fixture proposal only.'}})},usage}
 return {type:'finish',result:{summary:'Done',artifacts:[find('my_write_workspace').result.reference]},usage}
}
const models=(slow:boolean):any=>({profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'test-only',modelFactory:()=>({next:async(request:any)=>{if(slow&&blocked){blocked=false;entered();await gate}return next(request)}}),tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}})
const options={version:'lane-test-v1',authorize:async(a:any)=>a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,readContext:async()=>({brand:{id,name:'Fixture'},productCatalog:[]}),readMarketingWorkspace:async()=>({brandId:id,status:'missing' as const,revision:'0'.repeat(64),workspace:null}),readInsight:async()=>({source:'AMC Growth',brandId:id,retrievedAt:new Date().toISOString(),status:'missing',report:null}),readUiPages:async()=>({})}
let running:Promise<any>|undefined
try{
 await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Lane fixture',status:'ACTIVE',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 await initializeHost(pool);await pool.query(`CREATE SCHEMA ${schema}`)
 const bg=await composeApplication(pool,models(true),options);background=bg.app
 const chat=await composeApplication(pool,models(false),{...options,taskPool});conversation=chat.app
 ;(globalThis as any).amcNativeHost=Promise.resolve({pool,app:background,tools:bg.tools,lane:'default',modelRevision:1})
 ;(globalThis as any).amcConversationHost=Promise.resolve({pool,taskPool,app:conversation,tools:chat.tools,lane:'conversation',modelRevision:1})
 const make=async(app:any,tools:string[],lane:'default'|'conversation',suffix='')=>{
  const intent:ConversationIntent={brandId:id,userId:id,goal:'Discuss a campaign',requestKey:id+'-'+lane+suffix,artifactPath:`work/${digest([actor,id+'-'+lane+suffix])}.json`,kind:'conversation',history:[],topic:'brand_planning'}
  const row=await admitIntent(pool,actor,intent,lane);assert.equal(row.runtime_lane,lane)
  const duplicate=await admitIntent(pool,actor,intent,lane==='default'?'conversation':'default');assert.equal(duplicate.runtime_lane,lane,'global admission pins the first lane across retries')
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:tools.filter(t=>!t.startsWith('amc.autopilot'))},{actor,callId:intent.requestKey})
  await intentForTask(pool,app,actor,receipt.id);return receipt
 }
 await changePreference(background,actor,{action:'remember',expectedRevision:0,content:'Please provide coherent recommendations.'})
 assert.equal((await readPreference(conversation,actor)).content,'Please provide coherent recommendations.','user preference is shared across queues')
 const old=await make(background,bg.tools,'default')
 running=background.runtime.tick();await started
 assert.equal((await background.runtime.state(actor,old.id)).status,'running')
 const fresh=await make(conversation,chat.tools,'conversation')
 await Promise.race([conversation.runtime.tick(),new Promise((_,reject)=>{const t=setTimeout(()=>reject(Error('conversation blocked behind background')),5000);t.unref()})])
 const completed=await conversation.runtime.get(actor,fresh.id,{history:true});assert.equal(completed.status,'succeeded')
 assert.equal((await background.runtime.state(actor,old.id)).status,'running','conversation finishes while background still blocked')
 assert((await conversation.ledger.taskUsage(await conversation.scope(actor),fresh.id)).complete)
 assert.deepEqual(await background.workspace.read(actor,completed.result.artifacts[0]),await conversation.workspace.read(actor,completed.result.artifacts[0]),'shared user workspace is preserved')
 await assert.rejects(()=>background.runtime.state(actor,fresh.id),/not found/i)
 await assert.rejects(()=>conversation.runtime.state(actorFor('other',id),fresh.id))
 release();await running;assert.equal((await background.runtime.state(actor,old.id)).status,'succeeded')
 assert.equal((await readNativeTaskStatus(id,id,fresh.id)).status,'succeeded')
 assert.equal((await readNativeTask(id,id,old.id)).status,'succeeded')
 const list=await listNativeTasks(id,id);assert(list.page.items.some(t=>t.id===fresh.id));assert(list.page.items.some(t=>t.id===old.id))
 for(const [lane,task] of [['default',old],['conversation',fresh]] as const){const receipt=await createNativeTask(id,id,{kind:'conversation',topic:'brand_planning',history:[],goal:'Discuss a campaign',requestKey:id+'-'+lane});assert.equal(receipt.id,task.id,'retry remains on its original runtime')}
 await pool.query('UPDATE amc_ai_requests SET task_id=NULL WHERE task_id=$1',[fresh.id])
 assert.equal((await readNativeTaskStatus(id,id,fresh.id)).status,'succeeded','lost conversation index is recovered from public Core binding')
 const extra=[]
 for(let i=0;i<21;i++)extra.push(await make(conversation,chat.tools,'conversation','-page-'+i))
 const first=await listNativeTasks(id,id);assert(first.page.nextCursor)
 const second=await listNativeTasks(id,id,first.page.nextCursor!);assert.equal(second.page.nextCursor,null)
 const combined=[...first.page.items,...second.page.items].map(t=>t.id);assert.equal(new Set(combined).size,combined.length);assert.equal(combined.length,23,'both queues paginate without dropped or repeated tasks')
 assert.equal((await controlNativeTask(id,id,extra[0].id,{action:'cancel',requestKey:randomUUID()})).task.status,'cancelled')
 await prisma.crewMember.updateMany({where:{userId:id},data:{active:false}})
 await assert.rejects(()=>readNativeTaskStatus(id,id,fresh.id))
 console.log('PASS: independent fenced conversation executor completes behind blocked background; shared receipts/workspace/usage, cross-lane idempotency, ownership, cursor compatibility and exact upstream composition')
}finally{delete (globalThis as any).amcNativeHost;delete (globalThis as any).amcConversationHost;release();await running;if(background)await background.close();if(conversation)await conversation.close();await taskPool.end();await pool.query(`DROP SCHEMA ${schema} CASCADE`);await pool.end();await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id}});await prisma.$disconnect()}
