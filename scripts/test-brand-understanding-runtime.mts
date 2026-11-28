import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent,intentForTask} from '../src/lib/ai-native/store.ts'
import {actorFor,conversationFrom,type ConversationIntent} from '../src/lib/ai-native/contract.ts'
import {readBrandUnderstanding} from '../src/lib/ai-native/brand-understanding-store.ts'
import {prisma} from '../src/lib/prisma.ts'
const url=new URL(process.env.DATABASE_URL||'');assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const id='runtime-'+randomUUID(),actor=actorFor(id,id),pool=nativePool(),session=randomUUID(),usage={inputTokens:20,outputTokens:10}
let turn=0,contextReads=0,app:any
const goals=['我们的顾客是家庭，不面向儿童。','谢谢','我们的顾客是上班族。','更正：我们的顾客是家庭，不面向儿童。']
const model={next:async(request:any)=>{
 const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=data.calls.filter((c:any)=>c.status==='succeeded'),find=(name:string)=>calls.findLast((c:any)=>c.capability===name)
 if(!find('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
 const ctx=find('amc.context').result
 assert(ctx.brandUnderstanding,'fresh understanding is delivered to the actual model envelope')
 if(turn===1)assert.equal(ctx.brandUnderstanding.current[0].text,goals[0])
 if(turn===3&&!find('amc.brand_understanding.save')){assert.equal(ctx.brandUnderstanding.current.length,0);assert.equal(ctx.brandUnderstanding.unresolved.length,1)}
 if(!find('assistant.skills.read'))return {type:'call',name:'assistant.skills.read',input:{id:ctx.requiredSkill},usage}
 if(turn!==1&&!find('amc.brand_understanding.save'))return {type:'call',name:'amc.brand_understanding.save',input:{expectedRevision:ctx.brandUnderstanding.revision,patch:{entries:[{key:'audience',scope:'brand',kind:'fact',quote:ctx.intent.goal,...(turn===3?{resolve:true}:{})}]}},usage}
 const written=find('my_write_workspace')
 if(!written)return {type:'call',name:'my_write_workspace',input:{path:ctx.intent.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'conversation',brandId:id,contextDigest:ctx.contextDigest,content:turn===1?'收到，继续沿用当前品牌理解。':'本轮沟通已处理，当前理解依据有效陈述继续调整。'})},usage}
 return {type:'finish',result:{summary:'Reply',artifacts:[written.result.reference]},usage}
}}
try{
 await prisma.brand.create({data:{id,name:'Memory runtime fixture'}});await initializeHost(pool)
 const composition=await composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'fixture',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:10000,price:{revision:'fixture',input:1,cachedInput:1,output:1}}}},{version:'understanding-runtime-fixture',authorize:async a=>a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,readContext:async()=>{contextReads++;return {name:'Fixture',productCatalog:[]}},readContextRevision:async()=> 'unchanged-source',readUnderstanding:readBrandUnderstanding})
 app=composition.app
 for(turn=0;turn<goals.length;turn++){
  const intent:ConversationIntent={kind:'conversation',topic:'general',brandId:id,userId:id,goal:goals[turn],history:[],contextSessionId:session,artifactPath:`work/understanding-${turn}.json`,requestKey:`understanding-${turn}-${id}`}
  await admitIntent(pool,actor,intent)
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composition.tools},{actor,callId:intent.requestKey})
  await intentForTask(pool,app,actor,receipt.id)
  for(let n=0;n<20&&['queued','running'].includes((await app.runtime.state(actor,receipt.id)).status);n++)await app.runtime.tick()
  const task=await app.runtime.get(actor,receipt.id,{history:true});assert.equal(task.status,'succeeded',JSON.stringify({status:task.status,waiting:task.waitingReason,calls:task.calls?.map((c:any)=>({capability:c.capability,status:c.status,error:c.error})),events:task.events?.slice(-3)}))
  const artifact=await app.workspace.read(actor,task.result.artifacts[0]);assert(conversationFrom(artifact.content,intent).content)
  assert.equal(task.calls.filter((c:any)=>c.capability==='amc.brand_understanding.save').length,turn===1?0:1)
 }
 assert.equal(contextReads,1,'source cache reused while understanding stays fresh outside it')
 assert.equal((await readBrandUnderstanding(id)).current.length,1)
 console.log('PASS actual Core runtime: four persisted turns, full source cache reuse, fresh memory per turn, noise skip, conflict exclusion, explicit correction and verified artifact completion. Model actions are deterministic fixtures.')
}finally{if(app)await app.close();await pool.end();await prisma.auditLog.deleteMany({where:{resourceType:'BrandKnowledge',metadata:{path:['brandId'],equals:id}}});await prisma.brand.deleteMany({where:{id}});await prisma.$disconnect()}
