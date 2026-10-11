import {randomUUID,randomBytes} from 'node:crypto'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {Pool} from 'pg'
import {prisma} from '../src/lib/prisma.ts'
import {creativeDigest,creativeWorkspace,CreativeRevisionError} from '../src/lib/brand-plan/creativeRevisionContract.ts'
import {MATCH_SHORTFALL_MESSAGE,openSlots,localPlanningTime} from '../src/lib/brand-plan/matchingContract.ts'
import * as matching from '../src/lib/brand-plan/matchingContract.ts'
import * as revisionContract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as nativeContract from '../src/lib/ai-native/contract.ts'
import * as libraryModule from '../src/lib/ai-native/library.ts'
import * as recommendations from '../src/lib/ai-native/recommendations.ts'
import * as diversity from '../src/lib/ai-native/creative-diversity.ts'
import {readBrandFacts} from '../src/lib/ai-native/facts.ts'
import {readCreativeRevisions,saveCreativeRevision} from '../src/lib/brand-plan/creativeRevisions.ts'
import {summarizeCreativeFeedback,validateCreativeFeedback} from '../src/lib/brand-plan/revisionFeedback.ts'
const url=new URL(process.env.DATABASE_URL||'');assert(url.hostname==='127.0.0.1'&&url.pathname==='/amc_lineage_test_unified')
const pool=new Pool({connectionString:url.href}),brandId='unified-test',userId='unified-user',month='2026-12'
const plan={annualPlan:{strategy:'Match real educational creative requirements',quarterlyPlans:[{startMonth:month,endMonth:month}]}}
const tasks=new Map<string,any>(),keys=new Map<string,string>();let waitingReason:string|null=null;let count=0,matchCount=8,libraryFailures=false,revoked=false,crashAfterSave=false,rejectCandidate=false
const host={pool,app:{runtime:{get:async(_actor:any,id:string)=>tasks.get(id).task},workspace:{read:async(_actor:any,ref:any)=>({content:tasks.get(ref.path).content})}}}
const createTask=async(_u:string,_b:string,body:any,_daily:any,_autopilot:any,binding:any)=>{
 if(keys.has(body.requestKey))return {id:keys.get(body.requestKey),status:'succeeded'}
 const id=`task-${++count}`,facts=await readBrandFacts(prisma,brandId),n=Math.min(3,matchCount);matchCount-=n
 const sources=Array.from({length:n},(_,i)=>({inspirationCreativeId:`cre_fixture_${count}_${i}`,contentAngle:`${count} ${i}`,sourcePost:{title:randomUUID(),sourceUrl:`https://example.invalid/${count}/${i}`},scriptContent:{kind:'post'}}))
 const library={contextPortfolio:facts.creativePortfolio,sources,libraryDigest:'a'.repeat(64),contextDigest:nativeContract.digest(facts),retrievedAt:new Date().toISOString(),contentMatchRequestId:id,gaps:libraryFailures?[{status:503}]:[],libraryVersions:{}}
 const result={kind:'creative_discovery',brandId,libraryDigest:library.libraryDigest,contextDigest:library.contextDigest,summary:'fixture',recommendations:sources.map((s:any)=>({sourceCreativeId:s.inspirationCreativeId,title:s.sourcePost.title,planning:`Full isolated script ${s.sourcePost.title}: ${randomBytes(768).toString("base64url")}`,aiCaption:'Caption',materialRequirements:['Owned footage'],rationale:'Planning fit',skuIds:[]}))}
 const intent={kind:'creative_discovery',brandId,userId,goal:body.goal,requestKey:body.requestKey,artifactPath:id,requireMaterials:true,planningRequest:binding},ref={path:id,revision:1,digest:'b'.repeat(64)}
 const persisted=(await prisma.$queryRawUnsafe('SELECT $1::jsonb AS snapshot',JSON.stringify(library)) as any[])[0].snapshot
 tasks.set(id,{intent,content:JSON.stringify(result),task:{id,status:waitingReason?'waiting':'succeeded',waiting_reason:waitingReason,result:{artifacts:[ref]},calls:[{capability:'amc.library',status:'succeeded',result:persisted}]}});keys.set(body.requestKey,id);return{id,status:'succeeded'}
}
const deps:any={
 '../prisma':{prisma},'../brand-plan/creativeRevisionContract':revisionContract,
 '../brand-plan/service':{buildMonthlyPublishingSchedule:(_month:string,_freq:any,_fallback:any,total:number)=>Array.from({length:total},(_,i)=>({date:`${month}-${String(i+1).padStart(2,'0')}`,platform:{slug:'instagram'}}))},
 '../brand-plan/matchingContract':matching,'./contract':nativeContract,'./application':{requireActor:async()=>{if(revoked)throw nativeContract.nativeError('ai_access_denied',403)}},
 './service':{getNativeHost:async()=>host,createNativeTask:createTask},'./store':{intentForTask:async(_pool:any,_app:any,_actor:any,id:string)=>({intent:tasks.get(id).intent})},'./library':libraryModule,
 './recommendations':{saveRecommendation:async(...args:any[])=>{if(rejectCandidate)throw nativeContract.nativeError('recommendation_sku_mismatch',409);const result=await (recommendations.saveRecommendation as any)(...args);if(crashAfterSave){crashAfterSave=false;throw Error('lost receipt')}return result}},'./creative-diversity':diversity,
}
const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/calendar-planning.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports)
const {requestCalendarMatching,readCalendarMatching,advanceCalendarMatching}=mod.exports
try{
 await prisma.brand.deleteMany({where:{id:brandId}});await prisma.user.deleteMany({where:{id:userId}})
 await prisma.roleDefinition.upsert({where:{id:'AMC_PRINCIPAL'},create:{id:'AMC_PRINCIPAL',name:'Principal',normalizedName:'principal',builtIn:true},update:{enabled:true}})
 await prisma.user.create({data:{id:userId,email:'unified@example.invalid',password:'test-only',businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id:brandId,name:'Unified test',status:'ACTIVE',timezone:'Asia/Singapore',crew:{create:{members:{create:{userId,role:'PRINCIPAL'}}}},knowledge:{create:{negPrompts:[],marketingSolution:plan}}}})
 const body={month,publishingFreqOverride:{platforms:{instagram:{postsPerMonth:20}}}}
 await Promise.all([requestCalendarMatching(userId,brandId,body),requestCalendarMatching(userId,brandId,body)])
 assert.equal(await prisma.brandMarketingSolution.count({where:{brandId,kind:matching.MATCH_REQUEST_KIND}}),1)
 const day=new Date('2026-11-01T06:00:00Z')
 crashAfterSave=true;await advanceCalendarMatching(brandId,day);await advanceCalendarMatching(brandId,day);await advanceCalendarMatching(brandId,day);await advanceCalendarMatching(brandId,day)
 let status=(await readCalendarMatching(userId,brandId,month)).request
 assert.equal(count,3);assert.equal(status.filled,8);assert.equal(status.pending.length,12);assert.equal(status.message,MATCH_SHORTFALL_MESSAGE)
 let knowledge=await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}}),items=(knowledge.marketingSolution as any).publishingCalendar.months[month]
 assert.equal(new Set(items.map((x:any)=>x.inspirationCreativeId)).size,8)
 const item=items[0],actor={id:userId,type:'HUMAN'},read=await readCreativeRevisions(actor,brandId,month,item.id)
 assert.equal(read.revisions[0].actor.type,'AI');assert.equal(read.current.nativeReviewStatus,'pending_review')
 const saved=await saveCreativeRevision(actor,brandId,month,item.id,{expectedRevision:read.expectedRevision,idempotencyKey:'manual-edit-test',patch:{planning:'Human revised transitions'},feedback:{reasons:['transitions'],note:'Connect shots'}})
 assert(saved.receipt.changes.some((x:any)=>x.field==='planning'));assert.equal(saved.receipt.feedback.reasons[0],'transitions');assert.equal(saved.receipt.source.creativeId,item.inspirationCreativeId)
 await assert.rejects(()=>saveCreativeRevision(actor,brandId,month,item.id,{expectedRevision:read.expectedRevision,idempotencyKey:'stale-edit-test',patch:{title:'stale'}}),(e:any)=>e.code==='creative_revision_conflict')
 matchCount=2;libraryFailures=true;await advanceCalendarMatching(brandId,new Date('2026-11-02T04:00:00Z'));assert.equal(count,3,'daytime does not create nightly runs')
 await advanceCalendarMatching(brandId,new Date('2026-11-01T18:00:00Z'));assert.equal(count,4,'02:00 local triggers next night')
 status=(await readCalendarMatching(userId,brandId,month)).request;assert.equal(status.filled,10);assert.equal(status.status,'error');assert.equal(status.message,null,'partial service failure is not a quality shortfall')
 const after=await readCreativeRevisions(actor,brandId,month,item.id);assert.equal(after.current.planning,'Human revised transitions')
 matchCount=0;libraryFailures=false;await advanceCalendarMatching(brandId,new Date('2026-11-02T18:00:00Z'));assert.equal((await readCalendarMatching(userId,brandId,month)).request.message,MATCH_SHORTFALL_MESSAGE)
 revoked=true;await advanceCalendarMatching(brandId,new Date('2026-11-03T18:00:00Z'));assert.equal(count,5,'revoked authorization does not start task');revoked=false
 matchCount=2;rejectCandidate=true;await advanceCalendarMatching(brandId,new Date('2026-11-03T18:00:00Z'));assert.equal(count,6);assert.equal((await readCalendarMatching(userId,brandId,month)).request.lastRun.finished,true,'invalid immutable candidate ends batch');rejectCandidate=false;const retry=await requestCalendarMatching(userId,brandId,body);assert.equal(retry.request.lastRun.finished,false);await advanceCalendarMatching(brandId,new Date('2026-11-03T19:00:00Z'));assert.equal(count,6,'explicit retry reuses original task');await advanceCalendarMatching(brandId,new Date('2026-11-04T04:00:00Z'));assert.equal(count,6);matchCount=0;await advanceCalendarMatching(brandId,new Date('2026-11-04T18:00:00Z'));assert.equal(count,7,'next night starts fresh after rejected candidate');
 waitingReason='invalid_model_action';await advanceCalendarMatching(brandId,new Date('2026-11-05T18:00:00Z'));let halted=(await readCalendarMatching(userId,brandId,month)).request;assert.equal(halted.status,'error');assert.equal(halted.error,'task_invalid_model_action');assert.equal(halted.message,null);assert.equal(halted.lastRun.finished,true);
 waitingReason='limit';await advanceCalendarMatching(brandId,new Date('2026-11-06T18:00:00Z'));assert.equal((await readCalendarMatching(userId,brandId,month)).request.status,'deferred');waitingReason=null;
 knowledge=await prisma.brandKnowledge.findUniqueOrThrow({where:{brandId}});await prisma.brandKnowledge.update({where:{brandId},data:{marketingSolution:{...(knowledge.marketingSolution as any),annualPlan:{strategy:'Changed'}}}})
 await advanceCalendarMatching(brandId,new Date('2026-11-03T18:00:00Z'));assert.equal((await readCalendarMatching(userId,brandId,month)).request.status,'plan_changed');assert.equal(count,9)
 assert.throws(()=>validateCreativeFeedback({reasons:['made_up'],note:''}),CreativeRevisionError)
 const rows=await prisma.brandMarketingSolution.findMany({where:{brandId,kind:'CREATIVE_ITEM'}});assert.equal(summarizeCreativeFeedback(rows).reasons.transitions,1)
 assert(localPlanningTime('Asia/Singapore',new Date('2026-11-01T18:00:00Z')).night)
 assert.equal(openSlots([{id:'1',date:'2026-01-01',platform:'instagram'}],[],'2026-11-01').expired.length,1)
 console.log('PASS: real PostgreSQL request concurrency; 20 targets/8 matches/12 gaps; zero match; nightly-only replenishment; unknown save recovery; no duplicates; human edit preservation; conflict; source lineage; reason metrics; revoked access; changed plan; expired slots. Model/matcher are fixtures.')
}finally{await pool.end();await prisma.$disconnect()}
