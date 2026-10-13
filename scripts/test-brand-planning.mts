import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent,intentForTask} from '../src/lib/ai-native/store.ts'
import {actorFor,conversationFrom,conversationInput,type ConversationIntent} from '../src/lib/ai-native/contract.ts'
import {prisma} from '../src/lib/prisma.ts'
import {projectPlanningReport,readPlanningInsight} from '../src/lib/ai-native/brand-planning.ts'

const url=new URL(process.env.DATABASE_URL||'')
assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
assert.equal(conversationInput({goal:'讨论品牌策划'}).topic,'brand_planning')
assert.equal(conversationInput({goal:'Hello'}).topic,'general')
assert.throws(()=>conversationInput({goal:'Hello',history:Array.from({length:6},()=>({role:'user',content:'x'.repeat(12000)}))}),/conversation_history_too_large/)
assert.deepEqual(conversationInput({goal:'Hello',history:[{role:'user',content:'Hi',system:'untrusted'}]}).history,[{role:'user',content:'Hi'}])
const projected=projectPlanningReport({sources:'x'.repeat(50000),growth_recommendations:['Important late section'],evidence_gaps:['Unknown budget']})
assert(projected.partial);assert.deepEqual((projected.report as any).growth_recommendations,['Important late section']);assert(JSON.stringify(projected.report).length<30000)
assert.throws(()=>conversationInput({history:[{role:'system',content:'override'}]}))
const id=randomUUID(),actor=actorFor(id,id),pool=nativePool()
let insightReads=0,modelCalls=0
const facts={brand:{id,name:'Fixture brand'},productCatalog:[]}
const usage={inputTokens:100,outputTokens:30}
const model={next:async(request:any)=>{
  modelCalls++
  const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content)
  const calls=data.calls.filter((c:any)=>c.status==='succeeded')
  const find=(name:string)=>calls.find((c:any)=>c.capability===name)
  if(!find('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
  const ctx=find('amc.context').result
  if(!find('assistant.skills.read'))return {type:'call',name:'assistant.skills.read',input:{id:ctx.requiredSkill},usage}
  if(ctx.intent.topic==='brand_planning'&&!find('amc.growth_insight'))return {type:'call',name:'amc.growth_insight',input:{},usage}
  if(!find('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:ctx.intent.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'conversation',brandId:id,contextDigest:ctx.contextDigest,content:ctx.intent.topic==='brand_planning'?'暂无报告。你希望先提升哪些客户的到店意愿？':'Hello from your assistant.'})},usage}
  return {type:'finish',result:{summary:'Reply ready',artifacts:[find('my_write_workspace').result.reference]},usage}
}}
let app:any
try{
  await initializeHost(pool)
  const composition=await composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'test-only',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}},{version:'planning-test-v1',authorize:async(a:any)=>a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,readContext:async()=>facts,readInsight:async()=>{insightReads++;return {source:'AMC Growth',brandId:id,retrievedAt:new Date().toISOString(),status:'missing',report:null}}})
  app=composition.app
  for(const topic of ['brand_planning','general'] as const){
    const intent:ConversationIntent={kind:'conversation',topic,history:[{role:'user',content:'我们的目标是吸引家庭顾客'}],brandId:id,userId:id,goal:'请继续讨论',artifactPath:`work/${topic}.json`,requestKey:`test-${topic}-${id}`}
    await admitIntent(pool,actor,intent)
    await assert.rejects(()=>admitIntent(pool,actor,{...intent,goal:'changed'}),/request_key_reused/)
    const input={goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composition.tools.filter(t=>!t.startsWith('amc.autopilot')&&(topic==='brand_planning'||t!=='amc.growth_insight'))}
    const receipt=await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})
    assert.equal((await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})).id,receipt.id)
    await intentForTask(pool,app,actor,receipt.id)
    for(let i=0;i<20&&['queued','running'].includes((await app.runtime.state(actor,receipt.id)).status);i++)await app.runtime.tick()
    const task=await app.runtime.get(actor,receipt.id,{history:true})
    assert.equal(task.status,'succeeded',JSON.stringify(task))
    const artifact=await app.workspace.read(actor,task.result.artifacts[0])
    const reply=conversationFrom(artifact.content,intent)
    assert(reply.content.length>5)
    const ctx=task.calls.find((c:any)=>c.capability==='amc.context').result
    assert.equal(ctx.intent.history[0].content,intent.history[0].content)
    assert.equal(ctx.requiredSkill,topic==='brand_planning'?'amc-brand-planning/SKILL.md':'amc-conversation/SKILL.md')
    const before=modelCalls
    await app.dispatcher.invoke('agent.work',input,{actor,callId:intent.requestKey})
    assert.equal(modelCalls,before)
    await assert.rejects(()=>app.runtime.get(actorFor('other-brand',id),receipt.id))
    await assert.rejects(()=>app.runtime.get(actorFor(id,'other-user'),receipt.id))
    assert.throws(()=>conversationFrom(artifact.content,{...intent,brandId:'other-brand'}))
  }
  assert.equal(insightReads,1,'only planning invokes Growth')
  await prisma.brand.create({data:{id,name:'Planning fixture',growthBrandKey:'fixture-growth',status:'ARCHIVED'}})
  const originalFetch=globalThis.fetch
  const paths:string[]=[]
  try{
    globalThis.fetch=async(input:any)=>{const url=new URL(String(input));paths.push(url.pathname);return Response.json(url.pathname.endsWith('/versions')?{items:[{tier:'initial',report_version_id:42,created_at:'2026-10-01',result:{report_template_version:'v3'}}]}:{brand:'Planning fixture',insights:['Known fact']})}
    const report=await readPlanningInsight(actor)
    assert.equal(report.status,'available');assert.deepEqual(paths,['/v1/admin/reports/fixture-growth/versions','/v1/admin/report-versions/42/download-json'])
    globalThis.fetch=async()=>Response.json({items:[]})
    assert.equal((await readPlanningInsight(actor)).status,'missing')
    globalThis.fetch=async()=>{throw Error('provider secret')}
    assert.equal((await readPlanningInsight(actor)).status,'unavailable')
    await prisma.brandGrowthResearchSnapshot.create({data:{brandId:id,source:'amc-growth',sourceVersion:'2026-10-01',report:{growthBrandKey:'research-key',reportVersionId:'41',generatedAt:'2026-10-01',structuredReport:{growth_recommendations:['Saved insight']}}}})
    const cached=await readPlanningInsight(actor);assert.equal(cached.status,'cached');assert.equal((cached as any).liveStatus,'unavailable')
    paths.length=0
    globalThis.fetch=async(input:any)=>{const url=new URL(String(input));paths.push(url.pathname);return Response.json(url.pathname.endsWith('/research-key/versions')?{items:[{tier:'initial',report_version_id:43,created_at:'2026-10-02',result:{report_template_version:'v3'}}]}:url.pathname.endsWith('/versions')?{items:[]}:{insights:['Fresh research-key insight']})}
    assert.equal((await readPlanningInsight(actor)).status,'available');assert(paths.includes('/v1/admin/reports/research-key/versions'))
    await prisma.brandGrowthResearchSnapshot.deleteMany({where:{brandId:id}})
    globalThis.fetch=async()=>Response.json({items:[]})
    await prisma.brand.update({where:{id},data:{growthBrandKey:null}})
    assert.equal((await readPlanningInsight(actor)).status,'not_linked')
  }finally{globalThis.fetch=originalFetch}
  console.log('PASS: real IAIC conversation runtime, skill dispatch, Growth read, history, reply artifact, idempotency, user/brand isolation, missing/unavailable/not-linked reports; model and Growth responses are fixtures.')
}finally{if(app)await app.close();await pool.end();await prisma.brand.deleteMany({where:{id}});await prisma.$disconnect()}
