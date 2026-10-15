import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {PGlite} from '@electric-sql/pglite'
import * as contract from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as workspace from '../src/lib/brand-plan/creativeWorkspaceContract.ts'
import * as feedback from '../src/lib/brand-plan/revisionFeedback.ts'
// Match Prisma's UTC timestamp(3) decoding; PGlite otherwise uses the host TZ.
process.env.TZ='UTC'
const compile=(path:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,`unexpected dependency ${key}`);return deps[key]},mod,mod.exports);return mod.exports}
const actor={id:'owner',type:'HUMAN'},brandId='brand',month='2026-11',creativeId='idea'
let access=true,edit=true,auditFailure=false,candidateReads=0,rows:any[]=[],audits:any[]=[],queue=Promise.resolve()
let item:any={id:creativeId,brandId,title:'A',planning:'Original',status:'idea_pending',platformTargets:['instagram'],source:{inspirationCreativeId:'source1',evidenceStatus:'full_source',timeline:[{id:'shot1'}]},skuDecision:{selectedSkuIds:['sku1']},schedule:{draftId:'draft1',scheduledAt:null,platform:'instagram',scheduledBy:'owner',scheduledAtRevisionId:'rev1'}}
const matches=(r:any,w:any):boolean=>Object.entries(w).every(([key,value]:[string,any])=>key==='input'?value.path.reduce((v:any,k:string)=>v?.[k],r.input)===value.equals:key==='AND'?value.every((v:any)=>matches(r,v)):key==='OR'?value.some((v:any)=>matches(r,v)):r[key]===value)
const tx:any={
  $queryRaw:async()=>[],
  user:{findUnique:async()=>({id:actor.id,nickname:'Owner',status:'ACTIVE',type:'HUMAN',role:'USER',businessRoles:[]})},
  brandKnowledge:{findUnique:async()=>({marketingSolution:{publishingCalendar:{months:{[month]:[structuredClone(item)]}}}})},
  brandMarketingSolution:{findFirst:async({where}:any)=>rows.find(r=>matches(r,where))||null,create:async({data}:any)=>{const row={...structuredClone(data),id:`event${rows.length}`,createdAt:new Date('2026-10-16T00:00:00Z')};rows.push(row);return row}},
  auditLog:{create:async({data}:any)=>{if(auditFailure)throw Error('audit failure');audits.push(data)}},
}
const db:any={...tx,$transaction:async(fn:any)=>{const previous=queue;let release:any;queue=new Promise(r=>release=r);await previous;const snapshot=structuredClone({rows,audits});try{return await fn(tx)}catch(e){({rows,audits}=snapshot);throw e}finally{release()}}}
const service=compile('src/lib/brand-plan/creativeRevisions.ts',{
  './matchingContract':{},'./revisionFeedback':feedback,'../ai-native/creative-diversity.ts':{},'../prisma.ts':{prisma:{}},'../ai-native/facts.ts':{},'node:crypto':await import('node:crypto'),
  '../role-permissions/store.ts':{readPolicies:async()=>({policies:{EDITOR:[]}})},'../role-permissions/contract.ts':{effectiveGrants:()=>edit?['draft.update']:[]},'../auth-v2/types.ts':{principalFromUser:()=>({globalRoles:[],permissionRoleIds:['EDITOR']})},
  '../user-management/brandAccess.ts':{canUserAccessBrand:async(brand:string)=>access&&brand===brandId},'./creativeRevisionContract.ts':contract,'./creativeWorkspaceContract.ts':workspace,'./creativeCollections.ts':{},'./creativeSkuContract':{},
})
const body={action:'discard_candidate',month,creativeId,taskId:'task1',artifactDigest:'artifact1',expectedRevision:contract.creativeDigest(item),idempotencyKey:'discard-request',feedback:{reasons:['other'],note:'private note'}}
let candidate:any={status:'succeeded',kind:'creative',month,creativeId,candidate:{expectedRevision:body.expectedRevision,patch:{planning:'candidate'}},artifact:{path:'artifact.json',revision:1,digest:'artifact1'}}
const resolve=async()=>{candidateReads++;return candidate}
const discard=(override:any={})=>service.recordCreativeCandidateDiscard(actor,brandId,{...body,...override},resolve,db)
const original=structuredClone(item)
const [first,replay]=await Promise.all([discard(),discard()])
assert.equal(first.receipt.id,replay.receipt.id);assert(replay.replayed);assert.equal(rows.length,1);assert.equal(audits.length,1);assert.equal(candidateReads,1)
assert.equal(rows[0].kind,feedback.CANDIDATE_FEEDBACK_KIND);assert.deepEqual(item,original)
assert.deepEqual(rows[0].input.dimensions.sku,['sku1']);assert.deepEqual(rows[0].input.dimensions.source,['source1'])
item={...item,title:'Later edit'};candidate=null
assert.equal((await discard()).receipt.id,first.receipt.id,'replay survives changed current and unavailable candidate')
await assert.rejects(()=>discard({feedback:{reasons:['brand_facts'],note:''}}),/creative_request_key_reused/)
edit=false;await assert.rejects(()=>discard(),/creative_edit_forbidden/);edit=true
access=false;await assert.rejects(()=>discard(),/creative_access_denied/);access=true
await assert.rejects(()=>service.recordCreativeCandidateDiscard(actor,'other-brand',body,resolve,db),/creative_access_denied/)
await assert.rejects(()=>discard({actorId:'forged'}),/invalid_candidate_feedback/)
await assert.rejects(()=>discard({taskId:'new-task',idempotencyKey:'stale-request'}),/creative_revision_conflict/)
item=original
candidate={status:'succeeded',kind:'creative',month,creativeId:'other-idea',candidate:{expectedRevision:body.expectedRevision},artifact:{digest:'artifact2'}}
await assert.rejects(()=>discard({taskId:'task2',artifactDigest:'artifact2',idempotencyKey:'wrong-candidate'}),/candidate_changed/)
candidate.creativeId=creativeId
auditFailure=true;await assert.rejects(()=>discard({taskId:'task2',artifactDigest:'artifact2',idempotencyKey:'audit-rollback'}),/audit failure/);auditFailure=false
assert.equal(rows.length,1);assert.equal(audits.length,1)
rows.push({kind:'CREATIVE_ITEM',brandId,input:{ai:{taskId:'task2',artifact:{digest:'artifact2'}}}})
await assert.rejects(()=>discard({taskId:'task2',artifactDigest:'artifact2',idempotencyKey:'already-adopted'}),/candidate_already_adopted/)
assert.deepEqual(item,original)

// A pre-upgrade AI receipt must replay with new review metadata without changing
// its stored hash, source, SKU, schedule or legacy feedback representation.
const legacyAi={taskId:'old-task',agentId:'agent',requestedBy:actor.id,contextDigest:'context',artifact:{path:'old.json',revision:1,digest:'old-artifact'}}
const legacyRequest={expectedRevision:contract.creativeDigest(item),idempotencyKey:'legacy-receipt',patch:{planning:'Existing saved text'},feedback:{reasons:['sku'],note:'old note'}}
const legacyRow={id:'legacy-revision',brandId,kind:'CREATIVE_ITEM',period:contract.revisionPeriod(month,creativeId),version:2,createdAt:new Date(),output:structuredClone(item),input:{creativeId,month,actor,ai:legacyAi,feedback:legacyRequest.feedback,requestKey:contract.creativeDigest([actor.id,legacyRequest.idempotencyKey]),requestHash:contract.creativeDigest({expectedRevision:legacyRequest.expectedRevision,patch:legacyRequest.patch,feedback:legacyRequest.feedback,ai:legacyAi})}}
rows.push(legacyRow)
const legacyReplay=await service.saveCreativeRevision(actor,brandId,month,creativeId,legacyRequest,db,{...legacyAi,instruction:'newly available instruction',reviewChanges:[]})
assert(legacyReplay.replayed);assert.equal(legacyReplay.receipt.id,'legacy-revision')
assert.deepEqual(legacyReplay.receipt.feedback.reasons,['sku_mismatch']);assert.deepEqual(legacyRow.input.feedback.reasons,['sku'])
assert.deepEqual(legacyReplay.receipt.content,original)

// Execute the production aggregate SQL, migration, JSONB projection and keyset
// pagination using PostgreSQL WASM. No external database or model is contacted.
const pg=new PGlite()
try{
  await pg.exec('CREATE TABLE "BrandMarketingSolution"(id text PRIMARY KEY,"brandId" text,kind text,version integer,"createdAt" timestamp(3),input jsonb,output jsonb)')
  await pg.exec(readFileSync('prisma/migrations/20261016060000_creative_feedback_window/migration.sql','utf8'))
  const indexes=await pg.query("SELECT indexname FROM pg_indexes WHERE indexname='BrandMarketingSolution_feedback_window_idx'");assert.equal(indexes.rows.length,1)
  const input={creativeId:'idea',month,actor:{type:'HUMAN'},changes:[{field:'planning',before:'SECRET SCRIPT',after:'SECRET SCRIPT 2'}],feedback:{reasons:['sku'],note:'SECRET NOTE'},ai:{instruction:'SECRET PROMPT',reviewChanges:[]},source:{creativeId:'source1',snapshot:{private:'SECRET SOURCE'}}}
  await pg.query(`INSERT INTO "BrandMarketingSolution" SELECT 'row'||lpad(n::text,5,'0'),$1,'CREATIVE_ITEM',1,'2026-10-16'::timestamp,$2::jsonb,jsonb_build_object('skuIds',jsonb_build_array('sku1'),'platform','Instagram','contentType','video','planning','SECRET SCRIPT') FROM generate_series(1,2003) n`,[brandId,JSON.stringify(input)])
  await pg.query(`INSERT INTO "BrandMarketingSolution" VALUES('foreign','foreign','CREATIVE_ITEM',1,'2026-10-17',$1::jsonb,'{}')`,[JSON.stringify(input)])
  let queries=0
  const sqlDb={...db,$queryRaw:async(strings:TemplateStringsArray,...args:any[])=>{
    queries++;const sql=strings.reduce((q,s,i)=>q+(i?`$${i}`:'')+s,'')
    assert.equal((sql.match(/LIMIT/g)||[]).length,3);assert(args.includes(2001))
    const result=await pg.query(sql,args.map(v=>v instanceof Date?v.toISOString():v))
    assert.equal(JSON.stringify(result.rows).includes('SECRET'),false,'database projection never returns raw content or notes')
    return result.rows.map((r:any)=>({...r,createdAt:new Date(r.createdAt)}))
  }}
  const page=await service.readCreativeFeedbackSummary(actor,brandId,null,sqlDb)
  assert.equal(page.sampleVersions,2000);assert(page.hasMore);assert(page.nextCursor);assert.equal(page.directlyAdoptedScripts,1)
  assert.equal(page.reasons.sku_mismatch,2000)
  const next=await service.readCreativeFeedbackSummary(actor,brandId,page.nextCursor,sqlDb)
  assert.equal(next.sampleVersions,3);assert.equal(next.hasMore,false);assert.equal(next.nextCursor,null)
  const beforeQueries=queries
  await assert.rejects(()=>service.readCreativeFeedbackSummary(actor,brandId,'invalid',sqlDb),/invalid_feedback_cursor/)
  await assert.rejects(()=>service.readCreativeFeedbackSummary(actor,'foreign',null,sqlDb),/creative_access_denied/)
  assert.equal(queries,beforeQueries)
  const raw=await pg.query(`SELECT input->'feedback'->'reasons' AS reasons FROM "BrandMarketingSolution" LIMIT 1`)
  assert.deepEqual((raw.rows[0] as any).reasons,['sku'],'legacy storage unchanged')
}finally{await pg.close()}

let auth:any=null,origin=true
const http=compile('src/lib/ai-native/http.ts',{'../user-management/auth':{resolveSessionOrApiKey:async()=>auth},'../role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin}})
const route=compile('src/app/api/brands/[id]/content-creatives/feedback/route.ts',{'@/lib/ai-native/http':http,'@/lib/ai-native/service':{readNativeTask:async()=>candidate},'@/lib/brand-plan/creativeRevisions':{readCreativeFeedbackSummary:async(a:any,b:string,c:string)=>{assert.equal(a.id,actor.id);assert.equal(b,brandId);assert.equal(c,'cursor');return {reviewedScripts:1}},recordCreativeCandidateDiscard:async(a:any,b:string,p:any)=>service.recordCreativeCandidateDiscard(a,b,p,resolve,db)}})
const ctx={params:Promise.resolve({id:brandId})},get=()=>new Request('https://localhost/api/feedback?cursor=cursor'),post=(value:string)=>new Request('https://localhost/api/feedback',{method:'POST',body:value})
assert.equal((await route.GET(get(),ctx)).status,401)
auth={user:actor};assert.equal((await route.GET(get(),ctx)).headers.get('cache-control'),'no-store')
origin=false;assert.equal((await route.POST(post('{}'),ctx)).status,403);origin=true
assert.equal((await route.POST(post('invalid'),ctx)).status,400)
assert.equal((await route.POST(post('x'.repeat(6001)),ctx)).status,413)
assert.equal((await route.POST(post(JSON.stringify(body)),ctx)).status,202)
auth={user:{...actor,type:'AI'}};assert.equal((await route.POST(post('{}'),ctx)).status,403)
console.log('PASS: independent discard, current/source/SKU/schedule preservation, trusted task binding, role/CAS/replay/audit rollback; PostgreSQL indexed bounded projection/cursor; authenticated route')
