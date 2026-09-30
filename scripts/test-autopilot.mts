import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {autopilotDb,autopilotSettings,initializeBrandAutopilotDefault} from '../src/lib/ai-native/autopilot-store.ts'
import {executeAutopilot,readAutopilot,autopilotAdapters} from '../src/lib/ai-native/autopilot.ts'
import {initializeIdeaPool,brandDay} from '../src/lib/ai-native/idea-pool.ts'
import {initializeHost,admitIntent} from '../src/lib/ai-native/store.ts'
import {actorFor,digest} from '../src/lib/ai-native/contract.ts'
import {revisionPeriod} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {readBrandFacts} from '../src/lib/ai-native/facts.ts'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {AUTOPILOT_TOOLS} from '../src/lib/ai-native/autopilot-capabilities.ts'
assert(process.env.DATABASE_URL?.includes('localhost')&&process.env.DATABASE_URL.includes('_test_'))
const id=`autopilot-${randomUUID()}`,other=`other-${id}`,pool=await autopilotDb(),day=brandDay('Asia/Singapore'),month=day.slice(0,7),runId=digest([id,day]),actor=actorFor(id,id)
let app:any,calls=0
const creative={id:'idea-one',date:day,title:'Verified brand introduction',platform:'instagram',planning:'Introduce the brand and invite questions. No invented products.',materialRequirements:['Brand entrance image'],contentType:'图文',nativeReviewStatus:'pending_review'}
const createRun=()=>pool.query(`INSERT INTO amc_iaic.autopilot_runs(id,brand_id,local_day,owner_id,account_id,config_revision,daily_limit,evidence) VALUES($1,$2,$3,$2,$4,2,1,$5)`,[runId,id,day,`account-${id}`,JSON.stringify({researchSnapshotId:`research-${id}`,adapted:{[creative.id]:`revision-${id}`}})])
try{
 await initializeIdeaPool(pool);await initializeHost(pool)
 for(const uid of [id,other])await prisma.user.create({data:{id:uid,email:`${uid}@example.invalid`,password:'fixture',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Autopilot fixture',timezone:'Asia/Singapore',status:'ACTIVE',crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],marketingSolution:{publishingCalendar:{months:{[month]:[creative]}}}}}}})
 await prisma.socialAccount.create({data:{id:`account-${id}`,brandId:id,platformId:'instagram',handle:'fixture'}})
 await prisma.mediaAsset.create({data:{id:`asset-${id}`,brandId:id,url:'https://example.invalid/brand.jpg',mimeType:'image/jpeg',sourceType:'upload',creativeId:creative.id,aiCaption:'Brand entrance'}})
 await prisma.brandMarketingSolution.create({data:{id:`revision-${id}`,brandId:id,kind:'CREATIVE_ITEM',period:revisionPeriod(month,creative.id),version:1,input:{source:{creativeId:'cre_test'},creativeId:creative.id,month},output:creative}})
 await prisma.brandGrowthResearchSnapshot.create({data:{id:`research-${id}`,brandId:id,source:'amc-growth',dataHash:id,report:{summary:'Verified brand profile; missing prices; use general introduction.'}}})
 await pool.query(`INSERT INTO amc_iaic.brand_ideas(id,brand_id,source_id,source,context_digest,match_id,library_versions,plan_id,plan_month) VALUES($1,$2,'cre_test','{}',$2,'test','{}',$3,$4)`,[randomUUID(),id,creative.id,month])
 const defaults=await autopilotSettings(id,id);assert.equal(defaults.settings.enabled,true)
 await initializeBrandAutopilotDefault(id)
 assert.equal((await autopilotSettings(id,id)).settings.enabled,true)
 const saved=await autopilotSettings(id,id,{enabled:true,revision:1,accountId:`account-${id}`,dailyLimit:1});assert.equal(saved.settings.revision,2)
 await assert.rejects(()=>autopilotSettings(id,id,{enabled:true,revision:0,accountId:`account-${id}`,dailyLimit:1}))
 await assert.rejects(()=>autopilotSettings(other,id))
 await createRun()
 await prisma.googleBrandImport.create({data:{brandId:id,configHash:id,status:'PENDING'}})
 autopilotAdapters.generate=async input=>{calls++;assert.equal(input.assetIds?.[0],`asset-${id}`);return {caption:'Generated verified brand post',hashtags:['brand'],contentEngine:'amc-content',fallbackUsed:false}}
 const usage={inputTokens:30,outputTokens:20}
 const model={next:async(request:any)=>{
  const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),history=data.calls.filter((c:any)=>c.status==='succeeded'),has=(name:string)=>history.some((c:any)=>c.capability===name),call=(name:string,input:any={runId})=>({type:'call',name,input,usage})
  if(!has('amc.context'))return call('amc.context',{})
  if(!has('amc.autopilot.await_profile'))return call('amc.autopilot.await_profile')
  if(!has('amc.autopilot.status'))return call('amc.autopilot.status')
  if(!has('amc.autopilot.strategy'))return call('amc.autopilot.strategy',{runId,title:'Brand strategy',content:'Use verified brand identity and entrance photography. Focus on brand introduction and audience questions, with varied story and educational directions. Avoid product, pricing and promotion claims because the verified catalog is empty. Produce an Instagram photo post and leave publication for the principal.'})
  if(!has('amc.autopilot.ideas'))return call('amc.autopilot.ideas')
  if(!has('amc.autopilot.generate')){await prisma.brandMarketingSolution.update({where:{id:`revision-${id}`},data:{input:{source:{creativeId:'cre_test'},creativeId:creative.id,month,ai:{contextDigest:digest(await readBrandFacts(prisma,id))}}}});return call('amc.autopilot.generate',{runId,creativeId:creative.id,assetIds:[`asset-${id}`]})}
  if(!has('amc.autopilot.save_content'))return call('amc.autopilot.save_content',{runId,outputId:history.find((c:any)=>c.capability==='amc.autopilot.generate').result.outputId})
  if(!has('my_write_workspace'))return call('my_write_workspace',{path:`work/${id}.json`,expectedRevision:0,mediaType:'application/json',content:JSON.stringify({kind:'autopilot_report',brandId:id,runId,draftIds:[history.find((c:any)=>c.capability==='amc.autopilot.save_content').result.draftId],summary:'Generated; publication requires human confirmation.'})})
  return {type:'finish',result:{summary:'Saved draft, not published',artifacts:[history.find((c:any)=>c.capability==='my_write_workspace').result.reference]},usage}
 }}
 const compose=()=>composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'fixture',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}},{version:'autopilot-fixture-v1',autopilotAdapters});const composed=await compose();app=composed.app
 const key=`autopilot-${runId}`,intent={kind:'autopilot' as const,runId,brandId:id,userId:id,requestKey:key,goal:'Autopilot fixture',artifactPath:`work/${id}.json`}
 await admitIntent(pool,actor,intent)
 await app.ledger.grant(await app.scope(actor),{reference:id,amount:600000,evidence:{test:true}})
 const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composed.tools.filter(t=>AUTOPILOT_TOOLS.includes(t)||['amc.context','my_write_workspace','my_read_workspace'].includes(t))},{actor,callId:key})
 await pool.query('UPDATE amc_iaic.autopilot_runs SET task_id=$2 WHERE id=$1',[runId,receipt.id])
 await app.runtime.tick()
 assert.equal((await app.runtime.state(actor,receipt.id)).waiting_reason,'external_result')
 assert.equal(calls,0,'no production while profile result is pending')
 await app.close();app=(await compose()).app
 await prisma.googleBrandImport.update({where:{brandId:id},data:{status:'PARTIAL',result:{missing:['MENU_PERMISSION_MISSING']}}})
 app.runtime.resultWaits.intervalMs=0
 for(let n=0;n<15;n++)await app.runtime.tick()
 const task=await app.runtime.get(actor,receipt.id,{history:true});assert.equal(task.status,'succeeded',JSON.stringify({status:task.status,calls:task.calls.map((c:any)=>({name:c.capability,status:c.status,error:c.error})),events:task.events.slice(-3)}))
 assert.equal(calls,1)
 const state:any=await readAutopilot(id,id,runId),output=state.outputs[0]
 assert.equal(output.status,'completed')
 const draft=await prisma.contentDraft.findUniqueOrThrow({where:{id:output.draft_id},include:{assetRefs:true}})
 assert.equal(draft.status,'draft');assert.equal(draft.scheduledAt,null);assert.equal(draft.publishedAt,null);assert.equal(draft.assetRefs.length,1)
 assert.equal((draft.viralCopyScriptProvenance as any).autopilot.revisionId,`revision-${id}`)
 await Promise.all(Array.from({length:4},()=>executeAutopilot(id,id,runId,'generate',{creativeId:creative.id,assetIds:[`asset-${id}`]})));assert.equal(calls,1)
 await executeAutopilot(id,id,runId,'save_content',{outputId:output.id});assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),1)
 await assert.rejects(()=>executeAutopilot(id,id,runId,'generate',{creativeId:'another-idea',assetIds:[`asset-${id}`]}),(e:any)=>e.code==='autopilot_daily_limit');assert.equal(calls,1)
 const unknownId=digest([id,'unknown-idea'])
 await pool.query(`INSERT INTO amc_iaic.autopilot_outputs(id,run_id,brand_id,creative_id,revision_id,source,status) VALUES($1,$2,$3,'unknown-idea','unknown-revision','{}','running')`,[unknownId,runId,id])
 await assert.rejects(()=>executeAutopilot(id,id,runId,'generate',{creativeId:'unknown-idea',assetIds:[`asset-${id}`]}),(e:any)=>e.code==='generation_result_requires_verification')
 assert.equal(calls,1,'unknown provider result cannot trigger another call')
 await autopilotSettings(id,id,{enabled:false,revision:2,accountId:`account-${id}`,dailyLimit:1})
 await assert.rejects(()=>executeAutopilot(id,id,runId,'generate',{creativeId:creative.id,assetIds:[`asset-${id}`]}))
 await initializeBrandAutopilotDefault(id);assert.equal((await autopilotSettings(id,id)).settings.enabled,false,'explicit opt-out survives default initialization')
 await assert.rejects(()=>readAutopilot(other,id,runId))
 console.log('PASS: real IAIC Agent capability decisions, Core result wait survives restart, durable strategy/script/assets lineage, one provider call under concurrent replay, draft-only save, default on, settings CAS, disable and brand authorization')
}finally{
 if(app)await app.close()
 await pool.query('DELETE FROM amc_iaic.brand_ideas WHERE brand_id=$1',[id]);await pool.query('DELETE FROM amc_iaic.brand_idea_days WHERE brand_id=$1',[id])
 await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id:{in:[id,other]}}});await pool.end();if((globalThis as any).amcIdeaPool)await(await(globalThis as any).amcIdeaPool).end();await prisma.$disconnect()
}
