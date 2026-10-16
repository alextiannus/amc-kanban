import './test-video-lineage.mts'
import './test-video-receipt-signature.mts'
import assert from 'node:assert/strict'
import ts from 'typescript'
import {readFileSync} from 'node:fs'
import {execFileSync} from 'node:child_process'
import {pinVideoEditor,editorForLibrary,videoDraftForLibrary} from '../src/lib/videoLineage.ts'
import {videoDraftReceipt} from '../src/lib/videoDraftReceipt.ts'
import {verifyVideoReceipt,videoReceiptDigest} from '../src/lib/videoReceipt.ts'
import {createHmac} from 'node:crypto'
const videoJobsRouteSource=readFileSync('src/app/api/content/video/jobs/route.ts','utf8')
assert.match(videoJobsRouteSource,/pg_advisory_xact_lock\(hashtext\([^\n]+\)\)::text/,'Prisma must receive a supported type from the advisory-lock query')
const compile=(file:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports','console',ts.transpileModule(process.env.VIDEO_LINEAGE_BASELINE&&file==='src/app/api/content/video/jobs/route.ts'?execFileSync('git',['show','b87f57b7:'+file],{encoding:'utf8'}):readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports,{...console,error:()=>{}});return mod.exports}
let actor:any={id:'owner',type:'HUMAN',role:'USER'},access=true,permission=true,origin=true,rows:any[]=[],writes=0,queue=Promise.resolve()
const creative:any={id:'rev1',brandId:'brand',kind:'CREATIVE_ITEM',input:{creativeId:'idea'},output:{id:'idea',source:{sourceRevision:'v1',libraryDigest:'digest',evidenceStatus:'full_source',timeline:[{id:'s1',narrativePurpose:'hook'}]},skuDecision:{selectedSkuIds:['sku'],recommendations:[{skuId:'sku',skuName:'Product',sourceShotIds:['s1']}]}}}
const tx:any={$queryRaw:async()=>[],brandMarketingSolution:{findFirst:async({where}:any)=>where.id==='rev1'&&where.brandId==='brand'?creative:null},videoProductionJob:{findUnique:async({where}:any)=>rows.find(row=>row.id===where.id),upsert:async({where,create,update}:any)=>{writes++;let row=rows.find(row=>row.id===where.id);if(row)Object.assign(row,structuredClone(update));else rows.push(row=structuredClone(create));return row}}}
const db:any={...tx,$transaction:async(fn:any)=>{const previous=queue;let release:any;queue=new Promise(r=>release=r);await previous;try{return await fn(tx)}finally{release()}}}
tx.mediaAsset={findMany:async()=>[{id:'asset',url:'https://example.invalid/trusted.jpg',mimeType:'image/jpeg',aiCaption:null}]}
const route=compile('src/app/api/content/video/jobs/route.ts',{'next/server':{NextResponse:Response},'@/lib/auth':{getSession:async()=>actor?{user:actor}:null,extractApiKey:()=>null,getAgentFromApiKey:async()=>null},'@/lib/brandAccess':{canSessionAccessBrandProject:async(brand:string)=>access&&brand==='brand'},'@/lib/prisma':{prisma:db},'@/lib/user-management/brandAccess':{canUserAccessBrand:async()=>access},'@/lib/videoReceipt':{verifyVideoReceipt,videoReceiptDigest},'@/lib/videoLineage':{pinVideoEditor,editorForLibrary},'@/lib/role-permissions/delegation':{requireActorPermission:async()=>{if(!permission)throw Object.assign(new Error('forbidden'),{status:403})}},'@/lib/role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin}})
const body:any={id:'video',brandId:'brand',creativeId:'idea',idea:'idea',assetIds:['asset'],plan:{_mmVideoJob:{editor:{brandId:'brand',creativeId:'idea',creativeRevisionId:'rev1',script:'actual script',assets:[{id:'asset',url:'https://example.invalid/a.jpg',mimeType:'image/jpeg'}],sourceReference:{libraryDigest:'FORGED'},skuDecision:{selectedSkuIds:['FORGED']},shotMappings:[{sourceShotId:'FORGED'}]}}}}
const post=(payload:any=body)=>route.POST(new Request('https://kanban.test/api/content/video/jobs',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}))
assert.equal((await post()).status,200)
const saved=rows[0].plan._mmVideoJob.editor
assert.equal(saved.assets[0].url,'https://example.invalid/trusted.jpg');assert.deepEqual(rows[0].mediaUrls,['https://example.invalid/trusted.jpg'])
assert.equal(saved.sourceReference.libraryDigest,'digest');assert.deepEqual(saved.skuDecision.selectedSkuIds,['sku']);assert.equal(saved.shotMappings[0].sourceShotId,'s1')
creative.output.source.libraryDigest='newest'
assert.equal((await post()).status,200);assert.equal(rows[0].plan._mmVideoJob.editor.sourceReference.libraryDigest,'digest')
await Promise.all([post(),post()]);assert.equal(rows.length,1)
assert.equal(editorForLibrary(rows[0],[]).script,'actual script');assert.equal(editorForLibrary(rows[0],[]).sourceReference.libraryDigest,'digest')
const count=writes
actor={...actor,id:'other'};assert.equal((await post()).status,403);actor.id='owner'
access=false;assert.equal((await post()).status,404);access=true
permission=false;assert.equal((await post()).status,403);permission=true
origin=false;assert.equal((await post()).status,403);origin=true
actor=null;assert.equal((await post()).status,401);actor={id:'owner',type:'HUMAN',role:'USER'}
const swapped=structuredClone(body);swapped.plan._mmVideoJob.editor.creativeRevisionId='another'
assert.equal((await post(swapped)).status,409)
assert.equal((await post({...body,plan:{}})).status,409)
assert.equal((await post({...body,idea:'x'.repeat(9*1024*1024)})).status,413)
assert.equal(writes,count)
const receiptTx:any={$queryRaw:async(_sql:any,jobId:string,brandId:string)=>jobId==='video'&&brandId==='brand'?[{id:'video',status:'completed',finalVideoUrl:'https://example.invalid/final.mp4'}]:[],contentDraft:{findFirst:async()=>({id:'draft',mediaUrls:['https://example.invalid/final.mp4']})}}
assert.equal((await videoDraftReceipt(receiptTx,'brand','video',['https://example.invalid/final.mp4']) as any).existingId,'draft')
assert.equal((await videoDraftReceipt(receiptTx,'other','video',['https://example.invalid/final.mp4']) as any).status,404)
assert.equal((await videoDraftReceipt(receiptTx,'brand','video',['https://example.invalid/forged.mp4']) as any).status,409)
console.log('PASS actual video receipt route: authoritative round-trip, current access, ownership, Origin, limits, immutable replays; isolated transaction ports')
console.log('Real PostgreSQL multi-connection suite retained as test-video-draft-receipt-postgres.mts')

let active=true,write=true
const lineageAccess=compile('src/lib/videoLineageAccess.ts',{'./prisma':{prisma:{...tx,user:{findUnique:async()=>({status:active?'ACTIVE':'DISABLED'})}}},'./user-management/brandAccess':{canUserAccessBrand:async()=>write},'./role-permissions/delegation':{requireActorPermission:async()=>{if(!permission)throw Object.assign(new Error('forbidden'),{status:403})}},'./videoLineage':{pinVideoEditor,editorForLibrary}})
const input=body.plan._mmVideoJob.editor
assert.equal((await lineageAccess.readVideoLineage('owner','brand',input)).sourceReference.libraryDigest,'newest')
active=false;await assert.rejects(()=>lineageAccess.readVideoLineage('owner','brand',input),/not_found/);active=true
write=false;await assert.rejects(()=>lineageAccess.readVideoLineage('owner','brand',input),/not_found/);write=true
rows.push({id:'legacy-video',brandId:'brand',createdBy:'owner',creativeId:'idea',idea:'original old script',assetIds:['asset'],plan:{}})
const legacyInput={...input,creativeRevisionId:null,originVideoJobId:'legacy-video'}
const legacy=await lineageAccess.readVideoLineage('owner','brand',legacyInput)
assert.equal(legacy.lineageWarning,'legacy_evidence_missing');assert.equal(legacy.creativeRevisionId,null);assert.equal(legacy.sourceReference,null);assert.equal(legacy.submittedScript,'original old script')
assert.equal((await post({...body,id:'legacy-video',plan:{_mmVideoJob:{editor:legacyInput}}})).status,200)
assert.equal(editorForLibrary(rows.find(row=>row.id==='legacy-video'),[]).lineageWarning,'legacy_evidence_missing')
await assert.rejects(()=>lineageAccess.readVideoLineage('other','brand',legacyInput),/not_found/)
await assert.rejects(()=>lineageAccess.readVideoLineage('owner','other',legacyInput),/not_found/)
await assert.rejects(()=>lineageAccess.readVideoLineage('owner','brand',{...legacyInput,originVideoJobId:'missing'}),/not_found/)
await assert.rejects(()=>lineageAccess.readVideoLineage('owner','brand',{...legacyInput,originVideoJobId:'video'}),/immutable/)
assert.equal((await post({...body,id:'fake-legacy',plan:{_mmVideoJob:{editor:{...legacyInput,originVideoJobId:undefined}}}})).status,409)
console.log('PASS server-record legacy reopen/edit, no latest-source lookup, owner/brand and forged downgrade denial')
const originalToken=process.env.CONTENT_SERVICE_INTERNAL_TOKEN
try{
 process.env.CONTENT_SERVICE_INTERNAL_TOKEN='test-only-video-lineage-token'
 const internal=compile('src/app/api/internal/content/video-lineage/route.ts',{'node:crypto':await import('node:crypto'),'@/lib/videoLineageAccess':lineageAccess})
 const request=(token:string,editor:any=input)=>new Request('https://kanban.test/api/internal/content/video-lineage',{method:'POST',headers:{'x-content-service-token':token},body:JSON.stringify({actorId:'owner',brandId:'brand',editor})})
 assert.equal((await internal.POST(request('wrong'))).status,401)
 const response=await internal.POST(request(process.env.CONTENT_SERVICE_INTERNAL_TOKEN));assert.equal(response.status,200);assert.equal((await response.json()).editor.sourceReference.libraryDigest,'newest')
 permission=false;assert.equal((await internal.POST(request(process.env.CONTENT_SERVICE_INTERNAL_TOKEN))).status,403);permission=true
 assert.equal((await internal.POST(request(process.env.CONTENT_SERVICE_INTERNAL_TOKEN,{...input,script:'x'.repeat(20001)}))).status,413)
}finally{if(originalToken===undefined)delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN;else process.env.CONTENT_SERVICE_INTERNAL_TOKEN=originalToken}
console.log('PASS trusted Content boundary: service authentication, active/write scope, permissions, authoritative replacement and size limit')

const previousReceiptToken=process.env.CONTENT_SERVICE_INTERNAL_TOKEN
try{
 process.env.CONTENT_SERVICE_INTERNAL_TOKEN='test-only-receipt-route-key'
 const editor=await pinVideoEditor(tx,'brand',body.plan._mmVideoJob.editor)
 const protectedKeys=['creativeId','creativeRevisionId','sourceReference','skuDecision','shotMappings','submittedScript','assets','lineageWarning']
 const revisions=[{id:'actual-revision',method:'video_scene_edit',actorId:'owner'}]
 const payload={schemaVersion:'amc-video-lineage@1',projectId:'content-project',brandId:'brand',ownerId:'owner',editorActorId:'owner',editorDigest:videoReceiptDigest(Object.fromEntries(protectedKeys.map(key=>[key,editor[key]??null]))),historyDigest:videoReceiptDigest({revisions,hasMore:false}),issuedAt:new Date().toISOString()}
 const videoReceipt={...payload,signature:createHmac('sha256',process.env.CONTENT_SERVICE_INTERNAL_TOKEN).update(JSON.stringify(payload)).digest('hex')}
 const signed={...body,id:'signed-video',plan:{basicVideoProjectId:'content-project',_mmVideoJob:{basicVideoProjectId:'content-project',editor,revisions,videoReceipt}}}
 assert.equal((await post(signed)).status,200)
 assert.equal((await post({...signed,plan:{...signed.plan,_mmVideoJob:{...signed.plan._mmVideoJob,revisions:[{id:'fake',actorId:'admin'}]}}})).status,409)
 assert.equal((await post({...signed,plan:{...signed.plan,basicVideoProjectId:'other-project'}})).status,409)
 assert.equal((await post({...signed,plan:{_mmVideoJob:{editor}}})).status,409)
 process.env.CONTENT_SERVICE_INTERNAL_TOKEN='test-only-rotated-key'
 assert.equal((await post(signed)).status,200)
 assert.equal((await post({...signed,id:'unseen-old-key'})).status,409)
 const content=compile('../amc-content/src/videoWorkspace/videoReceipt.ts',{'node:crypto':await import('node:crypto'),'../config.ts':{getConfig:()=>({})}})
 const legacyReceipt=content.signVideoReceipt({projectId:'legacy-recreated-project',brandId:'brand',ownerId:'owner',editorActorId:'owner',editor:legacy,revisions:[],revisionsHasMore:false},process.env.CONTENT_SERVICE_INTERNAL_TOKEN)
 assert.equal((await post({...body,id:'legacy-recreated-job',plan:{basicVideoProjectId:'legacy-recreated-project',_mmVideoJob:{editor:legacy,revisions:[],videoReceipt:legacyReceipt}}})).status,200,'signed Content recreation uses original server legacy record')
 const longHistory=Array.from({length:30},(_,i)=>({id:`long-${i}`,sceneId:i===0?'all-shots':'scene',affectedSceneIds:['scene','segment-2'],method:'video_scene_edit',fields:[{field:'prompt',before:'中'.repeat(12000),after:'新'.repeat(12000)}],note:'n'.repeat(2000),instruction:'i'.repeat(4000)}))
 const summaries=content.projectVideoHistory(longHistory)
 const v2=content.signVideoReceipt({projectId:'large-history-project',brandId:'brand',ownerId:'owner',editorActorId:'owner',editor,revisions:summaries,revisionsHasMore:true,revisionsCursor:'signed-cursor'},process.env.CONTENT_SERVICE_INTERNAL_TOKEN)
 const large={...body,id:'large-history-video',plan:{basicVideoProjectId:'large-history-project',_mmVideoJob:{editor,revisions:summaries,revisionsHasMore:true,videoReceipt:v2}}}
 assert.equal((await post(large)).status,200)
 const reopened=videoDraftForLibrary(rows.find(row=>row.id==='large-history-video'),[])
 assert.equal(reopened.revisions.length,30);assert.equal(reopened.revisions[29].fields[0].beforeLength,12000);assert.equal(reopened.revisionsHasMore,true);assert.equal(reopened.revisionsCursor,'signed-cursor')
 assert.equal(reopened.revisions[0].sceneId,'all-shots');assert.deepEqual(reopened.revisions[0].affectedSceneIds,['scene','segment-2'],'signed batch/segment associations survive library reopen')
 assert.equal((await post({...large,plan:{...large.plan,_mmVideoJob:{...large.plan._mmVideoJob,videoReceipt:{...v2,historyCursor:'forged'}}}})).status,409)
}finally{if(previousReceiptToken===undefined)delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN;else process.env.CONTENT_SERVICE_INTERNAL_TOKEN=previousReceiptToken}
console.log('PASS actual jobs route: signed Content history, immutable project, forged history rejection and rotation retry')
