import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {PGlite} from '@electric-sql/pglite'
import ts from 'typescript'

const compile=(file:string,deps:Record<string,unknown>)=>{
  const mod={exports:{} as any},output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
  new Function('require','module','exports','Buffer','Response','process',output)((key:string)=>{assert(key in deps,`missing dependency ${key}`);return deps[key]},mod,mod.exports,Buffer,Response,process)
  return mod.exports
}
const crypto=await import('node:crypto')
const contract=await import('../src/lib/brand-plan/creativeRevisionContract.ts')
const feedback=await import('../src/lib/brand-plan/revisionFeedback.ts')
let access=true
const service=compile('src/lib/brand-plan/videoFeedbackIngestion.ts',{'node:crypto':crypto,'@prisma/client':{},'../prisma.ts':{prisma:{}},'../user-management/brandAccess.ts':{canUserAccessBrand:async()=>access},'./creativeRevisionContract.ts':contract,'./revisionFeedback.ts':feedback})
const token='test-only-video-feedback-token',now=new Date('2026-10-17T08:00:00.000Z')
const unsigned={schema:'video_feedback_event@1',eventId:'event-1',projectId:'project-1',brandId:'brand-a',creativeId:'creative-a',creativeRevisionId:'revision-a',actorId:'actor-a',issuedAt:now.toISOString(),feedback:{sourceShotId:'shot-a',textChanges:[{field:'spokenText',before:'old',after:'new'}],captionMismatchBlocked:true,voiceReceiptChange:{beforeId:'voice-old',afterId:'voice-new'}}}
const sign=(value:any)=>{const core=service.videoFeedbackEventCore({...value,digest:'0'.repeat(64),signature:'0'.repeat(64)}),digest=service.videoFeedbackEventDigest(core);return {...core,digest,signature:service.videoFeedbackEventSignature(core,token,digest)}}
const signed=sign(unsigned)
assert.equal(service.verifyVideoFeedbackEvent(signed,token).digest,signed.digest)
assert.throws(()=>service.verifyVideoFeedbackEvent({...signed,signature:'0'.repeat(64)},token),/invalid_video_feedback_signature/)
assert.throws(()=>service.verifyVideoFeedbackEvent({...signed,unexpected:true},token),/invalid_video_feedback_event/)

const pg=new PGlite()
const previousToken=process.env.CONTENT_SERVICE_INTERNAL_TOKEN
process.env.CONTENT_SERVICE_INTERNAL_TOKEN=token
await pg.exec(`
  CREATE TABLE "Brand"(id text PRIMARY KEY,status text);
  CREATE TABLE "User"(id text PRIMARY KEY,status text,type text);
  CREATE TABLE "BrandMarketingSolution"(id text PRIMARY KEY,"brandId" text,kind text,period text,version integer,status text,"generationMode" text,"createdById" text,"createdAt" timestamptz DEFAULT now(),input jsonb,output jsonb);
  CREATE TABLE "VideoProductionJob"(id text PRIMARY KEY,"brandId" text,"creativeId" text,"createdBy" text,plan jsonb);
`)
await pg.exec(readFileSync('prisma/migrations/20261017010000_video_edit_feedback/migration.sql','utf8'))
await pg.exec(`INSERT INTO "Brand" VALUES('brand-a','ACTIVE'),('brand-b','ACTIVE'); INSERT INTO "User" VALUES('actor-a','ACTIVE','HUMAN');`)
await pg.query(`INSERT INTO "BrandMarketingSolution"(id,"brandId",kind,period,version,status,"generationMode","createdById",input,output) VALUES('revision-a','brand-a','CREATIVE_ITEM','period',1,'DRAFT','MANUAL','actor-a',$1::jsonb,'{}')`,[JSON.stringify({creativeId:'creative-a'})])
const validPlan={basicVideoProjectId:'project-1',_mmVideoJob:{basicVideoProjectId:'project-1',videoReceipt:{projectId:'project-1'},editor:{creativeId:'creative-a',creativeRevisionId:'revision-a'}}}
await pg.query(`INSERT INTO "VideoProductionJob" VALUES('job-a','brand-a','creative-a','actor-a',$1::jsonb)`,[JSON.stringify(validPlan)])
let seq=0
const tx:any={
  $queryRaw:async(strings:TemplateStringsArray,...args:any[])=>{const sql=strings.reduce((out,s,i)=>out+s+(i<args.length?`$${i+1}`:''),'');return (await pg.query(sql,args)).rows},
  user:{findUnique:async({where}:any)=>(await pg.query(`SELECT id,status,type FROM "User" WHERE id=$1`,[where.id])).rows[0]||null},
  brand:{findUnique:async({where}:any)=>(await pg.query(`SELECT id,status FROM "Brand" WHERE id=$1`,[where.id])).rows[0]||null},
  brandMarketingSolution:{
    findFirst:async({where}:any)=>{const clauses=['kind=$1'],values=[where.kind];if(where.id){values.push(where.id);clauses.push(`id=$${values.length}`)}if(where.brandId){values.push(where.brandId);clauses.push(`"brandId"=$${values.length}`)}if(where.period){values.push(where.period);clauses.push(`period=$${values.length}`)}return (await pg.query(`SELECT * FROM "BrandMarketingSolution" WHERE ${clauses.join(' AND ')} LIMIT 1`,values)).rows[0]||null},
    create:async({data}:any)=>{const id=`feedback-${++seq}`;return (await pg.query(`INSERT INTO "BrandMarketingSolution"(id,"brandId",kind,period,version,status,"generationMode","createdById",input,output) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb) RETURNING *`,[id,data.brandId,data.kind,data.period,data.version,data.status,data.generationMode,data.createdById,JSON.stringify(data.input),JSON.stringify(data.output)])).rows[0]},
  },
  videoProductionJob:{findMany:async({where}:any)=>{const rows=(await pg.query(`SELECT id,plan FROM "VideoProductionJob" WHERE "brandId"=$1 AND "creativeId"=$2 AND "createdBy"=$3`,[where.brandId,where.creativeId,where.createdBy])).rows as any[];const project=where.OR?.map((entry:any)=>entry.plan?.equals||entry.plan?.path&&entry.plan.equals).find(Boolean)||where.OR?.[0]?.plan?.equals;return rows.filter(row=>[row.plan?.basicVideoProjectId,row.plan?._mmVideoJob?.basicVideoProjectId,row.plan?._mmVideoJob?.videoReceipt?.projectId].includes(project)).slice(0,2)}},
}
const db:any={$transaction:async(fn:any)=>fn(tx)}
try{
  const route=compile('src/app/api/internal/content/video-feedback/route.ts',{'node:crypto':crypto,'@/lib/brand-plan/creativeRevisionContract':contract,'@/lib/brand-plan/videoFeedbackIngestion':{...service,ingestTrustedVideoFeedback:(body:any,t:string)=>service.ingestTrustedVideoFeedback(body,t,now,db)}})
  const post=(body:any,header=token)=>route.POST(new Request('https://kanban.test/api/internal/content/video-feedback',{method:'POST',headers:{'x-content-service-token':header},body:typeof body==='string'?body:JSON.stringify(body)}))
  let parsed=0
  const denied:any=new Request('https://kanban.test/api/internal/content/video-feedback',{method:'POST',body:'{}'});denied.text=async()=>{parsed++;return '{}'}
  assert.equal((await route.POST(denied)).status,401);assert.equal(parsed,0,'token authentication precedes body parsing')
  assert.equal((await post(signed,'wrong')).status,401)
  assert.equal((await post({...signed,signature:'0'.repeat(64)})).status,401)
  const created=await post(signed);assert.equal(created.status,201);assert.equal((await created.json()).replayed,false)
  const replay=await post(signed);assert.equal(replay.status,200);assert.equal((await replay.json()).replayed,true)
  const lateReplay=await service.ingestTrustedVideoFeedback(signed,token,new Date(now.getTime()+6*60*1000),db);assert.equal(lateReplay.replayed,true,'accepted signed events remain replayable after freshness expires')
  await assert.rejects(()=>service.ingestTrustedVideoFeedback(sign({...unsigned,eventId:'event-unseen-stale'}),token,new Date(now.getTime()+6*60*1000),db),/video_feedback_event_stale/)
  const conflict=sign({...unsigned,feedback:{...unsigned.feedback,captionMismatchBlocked:false}});assert.equal((await post(conflict)).status,409)
  assert.equal((await pg.query(`SELECT count(*)::int AS n FROM "BrandMarketingSolution" WHERE kind='VIDEO_EDIT_FEEDBACK'`)).rows[0].n,1)
  const stored:any=(await pg.query(`SELECT input FROM "BrandMarketingSolution" WHERE kind='VIDEO_EDIT_FEEDBACK'`)).rows[0]
  assert.equal(stored.input.signature,undefined);assert.equal(stored.input.feedback,undefined);assert(stored.input.videoFeedback);assert.equal(JSON.stringify(stored).includes('old'),true)
  access=false;assert.equal((await post(sign({...unsigned,eventId:'event-denied'}))).status,404);access=true
  await pg.query(`UPDATE "User" SET status='DISABLED' WHERE id='actor-a'`);assert.equal((await post(sign({...unsigned,eventId:'event-inactive'}))).status,404);await pg.query(`UPDATE "User" SET status='ACTIVE' WHERE id='actor-a'`)
  assert.equal((await post(sign({...unsigned,eventId:'event-cross',brandId:'brand-b'}))).status,404)
  assert.equal((await post(sign({...unsigned,eventId:'event-job-alias',projectId:'job-a'}))).status,404,'job id is never a Content project id alias')
  const inconsistent={...validPlan,_mmVideoJob:{...validPlan._mmVideoJob,basicVideoProjectId:'other-project'}}
  await pg.query(`UPDATE "VideoProductionJob" SET plan=$1::jsonb WHERE id='job-a'`,[JSON.stringify(inconsistent)])
  assert.equal((await post(sign({...unsigned,eventId:'event-mismatched-pin'}))).status,404)
  const missing={...validPlan};delete (missing as any).basicVideoProjectId
  await pg.query(`UPDATE "VideoProductionJob" SET plan=$1::jsonb WHERE id='job-a'`,[JSON.stringify(missing)])
  assert.equal((await post(sign({...unsigned,eventId:'event-missing-pin'}))).status,404)
  await pg.query(`UPDATE "VideoProductionJob" SET plan=$1::jsonb WHERE id='job-a'`,[JSON.stringify(validPlan)])
  assert.equal((await post('x'.repeat(service.VIDEO_FEEDBACK_EVENT_MAX_BYTES+1))).status,413)
  await assert.rejects(()=>pg.query(`INSERT INTO "BrandMarketingSolution"(id,"brandId",kind,period,version,status,"generationMode",input,output) VALUES('duplicate','brand-a','VIDEO_EDIT_FEEDBACK','event-1',1,'RECORDED','TEST','{}','{}')`),/unique|duplicate/i)
  const indexes=await pg.query(`SELECT indexname FROM pg_indexes WHERE indexname IN ('BrandMarketingSolution_video_feedback_event_id_uq','BrandMarketingSolution_video_feedback_window_idx')`);assert.equal(indexes.rows.length,2)
  console.log('PASS trusted video feedback: token-first auth, digest/HMAC/freshness, active access/binding, immutable replay/conflict, byte and partial-index gates')
}finally{await pg.close();if(previousToken===undefined)delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN;else process.env.CONTENT_SERVICE_INTERNAL_TOKEN=previousToken}
