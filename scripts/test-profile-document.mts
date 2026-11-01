import {readProfileWorkspace} from '../src/lib/profile-workspace-read'
import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {readProfileDocument,readProfileDocuments} from '../src/lib/profile-document.ts'
import {readProfileOverview} from '../src/lib/profile-overview.ts'
import {readAvailableInsight} from '../src/lib/brand-plan/insight-service.ts'
import {readBrandInformation,updateBrandInformation} from '../src/lib/brand-information.ts'
import {savePlanningDocument} from '../src/lib/ai-native/planning-document.ts'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent,intentForTask} from '../src/lib/ai-native/store.ts'
import {actorFor,conversationInput,type ConversationIntent} from '../src/lib/ai-native/contract.ts'
const url=new URL(process.env.DATABASE_URL!);assert.equal(url.hostname,'127.0.0.1');assert(url.pathname.startsWith('/amc_lineage_test_'))
const id=randomUUID(),actor=actorFor(id,id),pool=nativePool();let app:any
const bodies={brand_information:'## 品牌\nAMC。能力规划，未上线。',interview:'## 目标顾客\n商家，优先级待确认。',marketing_plan:'## 目标\n营销策略，预算待补充。'}
const usage={inputTokens:1,outputTokens:1,cachedInputTokens:0}
const model={async next(request:any){
 const input=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=input.calls||[],found=(name:string)=>calls.find((v:any)=>v.capability===name&&v.status==='succeeded')
 if(!found('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
 const ctx=found('amc.context').result,section=ctx.intent.profileSection as keyof typeof bodies,body=JSON.stringify(ctx)
 assert(body.includes(bodies[section].split('\n').at(-1)!),'selected body is present')
 for(const other of Object.keys(bodies) as Array<keyof typeof bodies>)if(other!==section)assert(!body.includes(bodies[other].split('\n').at(-1)!),'unrelated document omitted')
 assert(!body.includes('PRIVATE_STORE_SENTINEL'));assert(!body.includes('UNRELATED_REPORT_SENTINEL'))
 assert.equal(JSON.stringify(ctx.planningContext.workspace).split(bodies[section].split('\n').at(-1)!).length-1,1,'body included once')
 if(!found('assistant.skills.read'))return {type:'call',name:'assistant.skills.read',input:{id:ctx.requiredSkill},usage}
 if(!found('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:ctx.intent.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify({kind:'conversation',brandId:id,contextDigest:ctx.contextDigest,content:'已读取当前正文，可以按照你的要求调整。'})},usage}
 return {type:'finish',result:{summary:'Done',artifacts:[found('my_write_workspace').result.reference]},usage}
}}
try{
 await prisma.brand.create({data:{id,name:'Fixture',description:'Existing profile',knowledge:{create:{marketingSolution:{marketingPlan:{content:bodies.marketing_plan},coCreation:{}},stores:[{name:'PRIVATE_STORE_SENTINEL'}],researchReport:{summary:'UNRELATED_REPORT_SENTINEL'}}}}})
 await prisma.brandPlanInterview.create({data:{brandId:id,rawNotes:bodies.interview}})
 let document=await readProfileDocument(id,'brand_information');assert(document?.content.includes('Existing profile'))
 await savePlanningDocument(id,id,{stage:'brand_information',action:'save',content:bodies.brand_information,expectedRevision:document!.revision})
 assert.equal((await readProfileDocument(id,'brand_information'))?.content,bodies.brand_information)
 let info=await readBrandInformation(id);assert.equal(info?.content,bodies.brand_information);assert(!('merchantInformation' in info!))
 const updated=bodies.brand_information+' 保留限定。';await updateBrandInformation(id,id,{content:updated},info!.revision)
 assert.equal((await readProfileDocument(id,'brand_information'))?.content,updated)
 await assert.rejects(()=>updateBrandInformation(id,id,{content:'stale'},info!.revision),/changed/)
 await assert.rejects(()=>savePlanningDocument(id,id,{stage:'brand_information',action:'save',content:'stale',expectedRevision:document!.revision}),/conflict/)
 bodies.brand_information=updated
 assert.equal((await readProfileDocument(id,'interview'))?.content,bodies.interview)
 assert.equal((await readProfileDocument(id,'marketing_plan'))?.content,bodies.marketing_plan)
 const workspaceBefore=(await prisma.brandKnowledge.findUnique({where:{brandId:id}}))!.marketingSolution as any
 for(const current of [{},{marketingPlan:null}]){
  await prisma.brandKnowledge.update({where:{brandId:id},data:{brandPlan:{marketingPlan:{content:'LEGACY_STRATEGY'},coCreation:{brand_information:{content:'LEGACY_INFO'}}},marketingSolution:current}})
  const full=await readProfileDocuments(id),lean=await readProfileOverview(id)
  for(const section of ['brand_information','interview','marketing_plan'])assert.equal(lean?.documents[section].content,full?.[section].content,'legacy and explicit null overlay parity')
 }
 await prisma.brandKnowledge.update({where:{brandId:id},data:{brandPlan:{},marketingSolution:workspaceBefore}})
 await prisma.brandKnowledge.update({where:{brandId:id},data:{marketingSolution:{...workspaceBefore,history:{payload:'x'.repeat(16_000_000)},coCreation:{...workspaceBefore.coCreation,unrelated:{content:'SECRET_HISTORY'}}}}})
 const projected=await readProfileWorkspace(id)
 assert(Buffer.byteLength(JSON.stringify(projected))<10000,'DB projection must exclude 16MB history')
 assert(!JSON.stringify(projected).includes('SECRET_HISTORY'))
 const beforeRead=await prisma.brandKnowledge.findUnique({where:{brandId:id}})
 const all=await readProfileDocuments(id);assert.equal(all?.interview.content,bodies.interview);assert.equal(all?.marketing_plan.content,bodies.marketing_plan);assert.equal(all?.brand_information.content,updated)
 assert.deepEqual(await prisma.brandKnowledge.findUnique({where:{brandId:id}}),beforeRead,'document read must not write or regenerate')
 const originalFetch=globalThis.fetch;let providerReads=0
 try{globalThis.fetch=async()=>{providerReads++;throw Error('external_read_forbidden')};const savedInsight=await readAvailableInsight(id,{savedOnly:true});assert.equal(savedInsight.liveStatus,'not_checked');const overview=await readProfileOverview(id);assert.equal(overview?.documents.brand_information.content,bodies.brand_information);assert(!('revision' in overview!.documents.interview));assert.equal(overview?.documents.interview.content,bodies.interview);assert.equal(overview?.documents.marketing_plan.content,bodies.marketing_plan);assert.equal(overview?.brand.id,id);assert(!JSON.stringify(overview?.brand).includes('loginPassword'));assert.equal(providerReads,0)}finally{globalThis.fetch=originalFetch}
 assert.deepEqual(await prisma.brandKnowledge.findUnique({where:{brandId:id}}),beforeRead,'saved report read must not rewrite content')
 await initializeHost(pool)
 const composition=await composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'test-only',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}},{version:'profile-document-test',authorize:async a=>a.scopeId===actor.scopeId&&a.subjectId===actor.subjectId,readContext:async()=>{throw Error('must not read full brand context')},readMarketingWorkspace:async()=>{throw Error('must not read full workspace')},readInsight:async()=>{throw Error('must not fetch report')}})
 app=composition.app
 for(const section of ['brand_information','interview','marketing_plan'] as const){
  assert.equal(conversationInput({profileSection:section}).profileSection,section)
  const intent:ConversationIntent={kind:'conversation',topic:'brand_planning',profileSection:section,history:[],brandId:id,userId:id,goal:'只调整当前正文',artifactPath:`work/${section}.json`,requestKey:randomUUID()}
  await admitIntent(pool,actor,intent)
  const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composition.tools},{actor,callId:intent.requestKey})
  await intentForTask(pool,app,actor,receipt.id)
  for(let n=0;n<20&&['queued','running'].includes((await app.runtime.state(actor,receipt.id)).status);n++)await app.runtime.tick()
  const task=await app.runtime.get(actor,receipt.id,{history:true});assert.equal(task.status,'succeeded',JSON.stringify(task))
 }
 assert.throws(()=>conversationInput({profileSection:'other'}),/invalid_profile_section/)
 console.log('PASS Profile documents: canonical UI/AI saves, conflict protection, isolated runtime context, no extra source reads, exact single body')
}finally{await app?.close?.();await prisma.auditLog.deleteMany({where:{resourceId:id}});await prisma.brand.deleteMany({where:{id}});await pool.end();await prisma.$disconnect()}
