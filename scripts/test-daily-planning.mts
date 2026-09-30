import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {nativePool,initializeHost,admitIntent} from '../src/lib/ai-native/store.ts'
import {initializeIdeaPool,refreshBrandIdeas} from '../src/lib/ai-native/idea-pool.ts'
import {advanceDailyPlanning} from '../src/lib/ai-native/daily-planning.ts'
import {dailyActorFor,actorFor,digest} from '../src/lib/ai-native/contract.ts'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {readBrandFacts} from '../src/lib/ai-native/facts.ts'
import {creativeDirection,duplicateCreative,diverseCreatives} from '../src/lib/ai-native/creative-diversity.ts'
import {readCreativeRevisions,saveCreativeRevision} from '../src/lib/brand-plan/creativeRevisions.ts'
import {syncConfirmedCalendarItemsToDrafts,listOpenCalendarCreativeOptions} from '../src/lib/brand-plan/calendarSync.ts'
const url=new URL(process.env.DATABASE_URL||'');assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const id=`daily-${randomUUID()}`,pool=nativePool(),actor=dailyActorFor(id,id)
let app:any
const directions=['process','tasting','store_visit','brand_story','education','comparison']
const sources=directions.map((direction,n)=>({inspirationCreativeId:`cre_ins_${id}_${n}`,creativeDirection:direction,contentAngle:`${randomUUID()} ${randomUUID()}`,sourceVideo:{title:`Direction ${direction}`,platform:'instagram'},assetNeeds:['Own SKU footage'],scriptContent:{kind:'video',title:direction,body:randomUUID()}}))
const usage={inputTokens:30,outputTokens:20}
try{
 assert(duplicateCreative({sourceVideo:{sourceUrl:'https://example.com/v/1?utm_source=x'}},{sourceVideo:{sourceUrl:'https://example.com/v/1?utm_source=y'}}))
 assert.equal(creativeDirection({title:'Customer testimonial'}),'customer_story')
 const similar=Array.from({length:5},()=>({creativeDirection:'process',contentAngle:randomUUID()+randomUUID()}))
 assert.equal(diverseCreatives(similar,[],6).length,2)
 await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Daily test brand',status:'ACTIVE',autoPilot:false,timezone:'Asia/Singapore',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{menuItems:[{id:'sku_test',name:'Sesame Noodles'}],negPrompts:[]}}}})
 await initializeIdeaPool(pool);await initializeHost(pool)
 const facts=await readBrandFacts(prisma,id)
 await refreshBrandIdeas(pool,facts,async()=>({contentMatchRequestId:'fixture',creativeCandidates:sources,contentLibraryGaps:[],libraryVersions:{}}) as any)
 const model={next:async(request:any)=>{
  const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=data.calls.filter((c:any)=>c.status==='succeeded'),has=(name:string)=>calls.some((c:any)=>c.capability===name)
  if(!has('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
  const context=calls.find((c:any)=>c.capability==='amc.context').result
  if(!has('assistant.skills.list'))return {type:'call',name:'assistant.skills.list',input:{},usage}
  if(!has('assistant.skills.read'))return {type:'call',name:'assistant.skills.read',input:{id:'amc-discovery/SKILL.md',expectedVersion:calls.find((c:any)=>c.capability==='assistant.skills.list').result.find((s:any)=>s.id==='amc-discovery/SKILL.md').version},usage}
  if(!has('amc.library'))return {type:'call',name:'amc.library',input:{},usage}
  const library=calls.find((c:any)=>c.capability==='amc.library').result
  if(!has('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:context.intent.artifactPath,expectedRevision:0,mediaType:'application/json',content:JSON.stringify({kind:'creative_discovery',brandId:id,contextDigest:context.contextDigest,libraryDigest:library.libraryDigest,summary:'Adapted',recommendations:[{sourceCreativeId:library.sources[0].inspirationCreativeId,title:'Brand Sesame Noodles',planning:`Sesame Noodles: ${library.sources[0].creativeDirection}. Opening, scene, voiceover and menu CTA.`,skuIds:['sku_test'],aiCaption:'Sesame Noodles',materialRequirements:['Brand-owned Sesame Noodles footage, vertical 5 seconds'],rationale:'Verified SKU'}]})},usage}
  return {type:'finish',result:{summary:'Ready',artifacts:[calls.find((c:any)=>c.capability==='my_write_workspace').result.reference]},usage}
 }}
 const composed=await composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'fixture',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}},{version:'daily-test-v1'});app=composed.app
 const ports={getHost:async()=>({pool,app,tools:composed.tools,modelRevision:1}),createTask:async(userId:string,brandId:string,body:any)=>{
  await pool.query('UPDATE amc_iaic.brand_ideas SET selected_at=now() WHERE id=$1',[body.poolIdeaId])
  const intent:any={kind:'creative_discovery',automaticDaily:true,requireMaterials:true,poolIdeaId:body.poolIdeaId,brandId,userId,goal:'Automatic planning',artifactPath:`work/${body.poolIdeaId}.json`,requestKey:`daily-${body.poolIdeaId}`}
  const row=await admitIntent(pool,actor,intent);await app.ledger.grant(await app.scope(actor),{reference:row.id,amount:600000,evidence:{test:true}})
  return app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composed.tools},{actor,callId:intent.requestKey})
 }}
 await advanceDailyPlanning(pool,id,ports as any)
 assert.equal((await pool.query('SELECT count(*) FROM amc_ai_requests WHERE scope_id=$1',[actor.scopeId])).rows[0].count,'6','six daily tasks fit a separate brand budget')
 // Manual allowance is not consumed by background planning.
 await admitIntent(pool,actorFor(id,id),{kind:'brand_brief',brandId:id,userId:id,goal:'Human task',requestKey:'manual-test-request',artifactPath:'work/manual.json'})
 for(let n=0;n<30;n++)await app.runtime.tick()
 await advanceDailyPlanning(pool,id,ports as any);await advanceDailyPlanning(pool,id,ports as any)
 const rows=(await pool.query('SELECT * FROM amc_iaic.brand_ideas WHERE brand_id=$1',[id])).rows
 assert.equal(rows.filter(row=>row.plan_id).length,6,JSON.stringify(rows.map(row=>({error:row.last_error,task:row.task_id}))))
 const row=rows[0],history=await readCreativeRevisions({id,type:'HUMAN'},id,row.plan_month,row.plan_id)
 assert.equal(history.revisions.length,2);assert.equal(history.revisions[0].actor.type,'AI');assert.equal(history.revisions[0].principals[0].userId,id);assert.equal(history.current.nativeReviewStatus,'pending_review')
 const options=await listOpenCalendarCreativeOptions(id,row.plan_month);assert(options.every(item=>item.nativeDaily));assert.equal(options.length,6)
 const knowledge=await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId:id}}),items=(knowledge.marketingSolution as any).publishingCalendar.months[row.plan_month]
 assert.equal((await syncConfirmedCalendarItemsToDrafts(id,row.plan_month,items)).syncedCount,0,'pending AI plans must not become production drafts')
 const human=await saveCreativeRevision({id,type:'HUMAN'},id,row.plan_month,row.plan_id,{expectedRevision:history.expectedRevision,idempotencyKey:'daily-human-review',patch:{planning:history.current.planning+' Human reviewed.'}})
 assert.equal((human.receipt.content as any).nativeReviewStatus,'reviewed');assert.equal(human.receipt.actor.type,'HUMAN')
 // Automatic replacement retires pending drafts while retaining human-reviewed versions.
 await pool.query('UPDATE amc_iaic.brand_ideas SET replaced_at=now() WHERE brand_id=$1',[id]);await advanceDailyPlanning(pool,id,ports as any)
 const current=await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId:id}}),cards=(current.marketingSolution as any).publishingCalendar.months[row.plan_month]
 assert.equal(cards.filter((card:any)=>card.status==='archived').length,5);assert.equal(cards.find((card:any)=>card.id===row.plan_id).status,'planned_unimplemented')
 assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
 await prisma.crewMember.updateMany({where:{userId:id},data:{active:false}})
 await assert.rejects(()=>app.runtime.get(actor,row.task_id))
 console.log('PASS: source/url dedup, two-per-direction cap, six durable Core tasks, isolated daily budget, automatic plan insertion, AI/principal/source lineage, replay, no pre-review production, human review, safe retirement and revocation')
}finally{if(app)await app.close();await pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[id]);await pool.query('DELETE FROM amc_iaic.brand_idea_days WHERE brand_id=$1',[id]);await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id}});await pool.end();if((globalThis as any).amcIdeaPool)await(await(globalThis as any).amcIdeaPool).end();await prisma.$disconnect()}
