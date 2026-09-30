import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {prisma} from '../src/lib/prisma.ts'
import {composeApplication} from '../src/lib/ai-native/application.ts'
import {nativePool,initializeHost,admitIntent} from '../src/lib/ai-native/store.ts'
import {actorFor,digest,type DiscoveryIntent} from '../src/lib/ai-native/contract.ts'
import {brandLibrary,sourceExcerpt,discoveryFrom,type LibrarySnapshot} from '../src/lib/ai-native/library.ts'
import {saveRecommendation,recommendationReceipts} from '../src/lib/ai-native/recommendations.ts'
import {readBrandFacts} from '../src/lib/ai-native/facts.ts'
import {readCreativeRevisions} from '../src/lib/brand-plan/creativeRevisions.ts'
import {listOpenCalendarCreativeOptions} from '../src/lib/brand-plan/calendarSync.ts'
const url=new URL(process.env.DATABASE_URL||'')
assert(['localhost','127.0.0.1'].includes(url.hostname)&&url.pathname.startsWith('/amc_lineage_test_'))
const id=`discovery-${randomUUID()}`,actor=actorFor(id,id),pool=nativePool()
let app:any,allowed=true
try{
 await prisma.user.create({data:{id,email:`${id}@example.invalid`,password:randomUUID(),businessRoles:{create:{role:'AMC_PRINCIPAL'}}}})
 await prisma.brand.create({data:{id,name:'Brand test',description:'Handmade noodles',industry:'restaurant',status:'ARCHIVED',autoPilot:false,crew:{create:{members:{create:{userId:id,role:'PRINCIPAL'}}}}}})
 const facts=await readBrandFacts(prisma,id)
 const source={inspirationCreativeId:'cre_real_fixture',creativeCandidateId:'candidate_fixture',contentAngle:'Craft closeup',scriptContent:{kind:'video',opening:'Hands making noodles'},sourceVideo:{title:'Original craft',sourceUrl:'https://example.invalid/original'},assetNeeds:['Brand-owned preparation footage']}
 const payload={sources:[source],gaps:[],contentMatchRequestId:'match-fixture',libraryVersions:{creativeLibraryVersion:'current'},contextDigest:digest(facts)}
 let library:LibrarySnapshot={...payload,libraryDigest:digest(payload),retrievedAt:new Date().toISOString()}
 // Test the real adapter via a transport fixture, including persisted IDs and library review metadata.
 const realFetch=globalThis.fetch
 globalThis.fetch=async(_url,init)=>{const request=JSON.parse(String(init?.body));assert.equal(request.requirePersistedCreative,true);assert.equal(request.merchantId,id);return Response.json({creativeCandidates:[source,{...source,inspirationCreativeId:'cre_unreviewed',libraryGap:{reviewStatus:'needs_content_review'}},{...source,inspirationCreativeId:'invented'}],contentLibraryGaps:[],libraryVersions:{},contentMatchRequestId:'transport-fixture'})}
 const intent:DiscoveryIntent={kind:'creative_discovery',brandId:id,userId:id,goal:'Recommend brand-fit library ideas',requestKey:`discover-${randomUUID()}`,artifactPath:`work/${id}.json`}
 try{assert.equal((await brandLibrary(intent,facts)).sources.length,2)}finally{globalThis.fetch=realFetch}
 const value={kind:'creative_discovery',brandId:id,contextDigest:digest(facts),libraryDigest:library.libraryDigest,summary:'Craft suits handmade noodles.',recommendations:[{sourceCreativeId:source.inspirationCreativeId,title:'Handmade noodles',planning:'Show the brand’s actual preparation with its own footage.',aiCaption:'Made by hand.',materialRequirements:['Own preparation footage'],rationale:'Brand description confirms handmade noodles.'}]}
 assert(Buffer.byteLength(JSON.stringify(sourceExcerpt({...source,scriptContent:{kind:'video',body:'long'.repeat(30000),shots:Array.from({length:100},()=>({instruction:'long'.repeat(1000)}))}})))<6000,'source excerpts are bounded')
 assert.throws(()=>discoveryFrom(JSON.stringify({...value,recommendations:[{...value.recommendations[0],sourceCreativeId:'cre_forged'}]}),intent,library),/recommendation_source_mismatch/)
 assert.throws(()=>discoveryFrom(JSON.stringify({...value,libraryDigest:'0'.repeat(64)}),intent,library),/recommendation_source_mismatch/)
 const usage={inputTokens:100,outputTokens:30}
 const model={next:async(request:any)=>{
  const data=JSON.parse(request.messages.findLast((m:any)=>m.role==='user').content),calls=data.calls.filter((c:any)=>c.status==='succeeded'),has=(n:string)=>calls.some((c:any)=>c.capability===n)
  if(!has('amc.context'))return {type:'call',name:'amc.context',input:{},usage}
  if(!has('amc.library'))return {type:'call',name:'amc.library',input:{},usage}
  if(!has('my_write_workspace'))return {type:'call',name:'my_write_workspace',input:{path:intent.artifactPath,mediaType:'application/json',expectedRevision:0,content:JSON.stringify(value)},usage}
  return {type:'finish',result:{summary:'Recommendations ready',artifacts:[calls.find((c:any)=>c.capability==='my_write_workspace').result.reference]},usage}
 }}
 await initializeHost(pool)
 const composed=await composeApplication(pool,{profiles:[{id:'fixture',provider:'openai',model:'fixture',credentialRef:'fixture'}],resolveSecret:()=> 'fixture',modelFactory:()=>model,tokenPolicies:{fixture:{maximum:1000,price:{revision:'test',input:1,cachedInput:1,output:1}}}},{version:'discovery-test-v1',authorize:async(a:any)=>allowed&&a.subjectId===id&&a.scopeId===actor.scopeId,readLibrary:async()=>library})
 app=composed.app
 await admitIntent(pool,actor,intent)
 await app.ledger.grant(await app.scope(actor),{reference:id,amount:10000,evidence:{test:true}})
 const receipt=await app.dispatcher.invoke('agent.work',{goal:intent.goal,requiredArtifacts:[intent.artifactPath],allowedTools:composed.tools},{actor,callId:intent.requestKey})
 for(let n=0;n<20&&(await app.runtime.state(actor,receipt.id)).status==='queued';n++)await app.runtime.tick()
 const task=await app.runtime.get(actor,receipt.id,{history:true});assert.equal(task.status,'succeeded')
 const ref=task.result.artifacts[0],content=(await app.workspace.read(actor,ref)).content
 const body={sourceCreativeId:source.inspirationCreativeId,patch:{...value.recommendations[0],date:'2099-12-18',platform:'instagram'}}
 delete (body.patch as any).rationale;delete (body.patch as any).sourceCreativeId;body.patch.planning='Human-reviewed brand plan'
 const save=()=>saveRecommendation(id,id,task.id,intent,ref,content,library,body)
 const results=await Promise.all([save(),save()]);assert.equal(results[0].receipt.id,results[1].receipt.id)
 const saved=results[0];assert.equal(saved.verified,true);assert.equal(saved.creative?.planning,'Human-reviewed brand plan')
 assert.equal(saved.receipt.actor.id,id);assert.equal(saved.receipt.principals[0].userId,id);assert.equal(saved.receipt.source.creativeId,'cre_real_fixture')
 assert.equal(saved.receipt.source.snapshot.nativeSourceSnapshot.version,null)
 assert.equal(digest(await readBrandFacts(prisma,id)),digest(facts),'empty knowledge enrollment does not change brand facts')
 const history=await readCreativeRevisions({id,type:'HUMAN'},id,saved.month,saved.creativeId)
 assert.equal(history.revisions.length,2);assert.equal(history.revisions[1].origin,'library_recommendation');assert.equal(history.revisions[1].content.planning,value.recommendations[0].planning)
 assert.equal((await listOpenCalendarCreativeOptions(id,saved.month))[0].id,saved.creativeId)
 assert.equal((await recommendationReceipts(id,id,task.id))[0].creative?.id,saved.creativeId)
 await assert.rejects(()=>saveRecommendation(id,id,task.id,intent,ref,content,library,{...body,patch:{...body.patch,date:'2100-01-02'}}),/creative_request_key_reused/)
 await assert.rejects(()=>saveRecommendation(id,id,task.id,intent,ref,content,library,{...body,patch:{...body.patch,date:'2099-02-30'}}),/creative_date_must_remain_in_month/)
 await assert.rejects(()=>saveRecommendation(id,id,task.id,intent,ref,content,library,{...body,patch:{...body.patch,inspirationCreativeId:'forged'}}),/reviewed_creative_required/)
 await prisma.brand.update({where:{id},data:{description:'Changed facts'}})
 assert.equal((await save()).receipt.id,saved.receipt.id,'original receipt survives fact changes')
 await assert.rejects(()=>saveRecommendation(id,id,'different-task',intent,ref,content,library,body),/brand_context_changed/)
 await prisma.crewMember.updateMany({where:{userId:id},data:{active:false}})
 await assert.rejects(save,/creative_access_denied/)
 allowed=false;await assert.rejects(()=>app.runtime.get(actor,task.id))
 assert.equal(await prisma.contentDraft.count({where:{brandId:id}}),0)
 const emptyLibrary={...library,sources:[],libraryDigest:'f'.repeat(64)}
 assert.equal(discoveryFrom(JSON.stringify({...value,libraryDigest:emptyLibrary.libraryDigest,recommendations:[]}),intent,emptyLibrary).recommendations.length,0)
 console.log('PASS: real Core discovery, verified persisted source, empty library, human review provenance, new-brand enrollment, concurrent replay, cross-month duplicate prevention, plan readback, durable adoption receipts, stale facts and revocation; no publication')
}finally{
 if(app)await app.close()
 await prisma.brand.deleteMany({where:{id}});await prisma.user.deleteMany({where:{id}})
 await prisma.$disconnect();await pool.end()
}
