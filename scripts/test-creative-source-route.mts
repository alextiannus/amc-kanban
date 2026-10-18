import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { CreativeRevisionError, record } from '../src/lib/brand-plan/creativeRevisionContract.ts'
import * as mediaPolicy from '../src/lib/brand-plan/creativeSourceMediaPolicy.ts'

function load(path:string,deps:Record<string,unknown>) {
  const mod={exports:{} as any}
  new Function('require','module','exports',ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((name:string)=>{assert(name in deps, name);return deps[name]},mod,mod.exports)
  return mod.exports
}
let auth:any=null,calls=0,source:any,creative:any
const sourceId='cre_ins_original',sourceDigest='a'.repeat(64)
const reset=()=>{
  source={creativeId:sourceId,sourceRevision:'revision-1',sourceDigest,sourceEvidence:{scope:'full_source',originalText:'original'},timeline:[{id:'shot-1',order:0,startSec:0,endSec:2,visualDescription:'visual',shotScale:'wide',cameraMovement:'pan',subjectAction:'action',voiceover:'voice',onScreenText:'text',sound:'sound',narrativePurpose:'purpose',transition:'cut',secret:'not allowed'}],scriptContent:{kind:'video',originalText:'original',secret:'hidden'},originalVideoUrl:'https://media.example/video.mp4',originalPostUrl:'https://www.tiktok.com/@example/video/123',thumbnailUrl:'javascript:alert(1)',title:'Title',platform:'tiktok',libraryDetailPath:'/admin/inspiration-library/ins_original',credentials:'secret'}
  creative={current:{id:'idea',inspirationCreativeId:sourceId,nativeSourceSnapshot:{source:{inspirationCreativeId:sourceId,sourceRevision:'revision-1',sourceDigest}}},source:{creativeId:sourceId,evidence:'plan_snapshot'}}
}
reset()
const resolver=load('src/lib/brand-plan/creativeSource.ts',{
 './creativeSourceMediaPolicy':mediaPolicy,
 './creativeRevisions':{readCreativeRevisions:async(actor:any,brand:string,month:string,id:string)=>{
   assert.equal(actor.id,'trusted');assert.equal(month,'2026-11')
   if(brand!=='brand'||id!=='idea')throw new CreativeRevisionError('creative_access_denied',404)
   return creative
 }},
 './creativeRevisionContract':{CreativeRevisionError,record},
 '../promotion-strategy/clients':{fetchCreativeSourceEvidence:async(id:string)=>{calls++;assert.equal(id,sourceId);return source}},
})
const route=load('src/app/api/brands/[id]/content-creatives/[creativeId]/source/route.ts',{
 '@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>auth},
 '@/lib/brand-plan/creativeSource':resolver,
 '@/lib/brand-plan/creativeRevisionContract':{CreativeRevisionError},
})
const get=(brand='brand',id='idea')=>route.GET(new Request('http://localhost/source?month=2026-11'),{params:Promise.resolve({id:brand,creativeId:id})})
assert.equal((await get()).status,401);assert.equal(calls,0)
auth={user:{id:'trusted',type:'HUMAN'}}
assert.equal((await get('other')).status,404);assert.equal(calls,0)
assert.equal((await get('brand','missing')).status,404);assert.equal(calls,0)
const response=await get(),body=await response.json()
assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store')
assert.equal(body.evidenceStatus,'full_source')
assert.equal(body.timeline[0].voiceover,'voice')
assert.equal(body.timeline[0].continuityRequirements,undefined,'legacy full_source does not require continuity metadata')
assert.equal(body.timeline[0].secret,undefined)
assert.equal(body.thumbnailUrl,null)
assert.equal(body.libraryDetailPath,undefined)
assert.equal(body.credentials,undefined)
assert.equal(body.scriptContent.secret,undefined)
assert.equal(body.internalDetailPath,'/dashboard?brandId=brand&sub=ai_workspace&creativeId=idea&panel=source')
source.timeline[0].continuityRequirements=['同一张桌面','动作方向从左到右']
const withContinuity=await (await get()).json()
assert.deepEqual(withContinuity.timeline[0].continuityRequirements,['同一张桌面','动作方向从左到右'])
assert.deepEqual(withContinuity.scriptContent.timeline[0].continuityRequirements,withContinuity.timeline[0].continuityRequirements)
assert.equal(withContinuity.evidenceStatus,'full_source')
source.timeline[0].continuityRequirements=['安全文字',{secret:'hidden'}]
const invalidContinuity=await (await get()).json()
assert.equal(invalidContinuity.timeline[0].continuityRequirements,null)
assert.equal(invalidContinuity.evidenceStatus,'partial_source','malformed present continuity cannot silently disappear as full evidence')
reset()
source.sourceRevision='new';assert.equal((await get()).status,409)
reset();source.sourceDigest='b'.repeat(64);assert.equal((await get()).status,409)
reset();source.creativeId='cre_ins_other';assert.equal((await get()).status,404)
reset();delete creative.current.nativeSourceSnapshot
assert.equal((await (await get()).json()).evidenceStatus,'partial_source','legacy identity is not a pinned source version')
source.sourceEvidence.scope='source_unavailable';source.timeline=[]
assert.equal((await (await get()).json()).evidenceStatus,'source_unavailable')
reset();creative.current={id:'idea'};creative.source={}
const before=calls;assert.equal((await get()).status,404);assert.equal(calls,before)
reset();source.originalVideoUrl='https://user:password@media.example/a';source.originalPostUrl='file:///private/secret'
const unsafe=await (await get()).json();assert.equal(unsafe.originalVideoUrl,null);assert.equal(unsafe.originalPostUrl,null)
reset();source.sourceEvidence.scope='partial_source'
assert.equal((await (await get()).json()).evidenceStatus,'partial_source')
reset();source.timeline[0].visualDescription={token:'secret'}
const malformed=await (await get()).json()
assert.equal(malformed.timeline[0].visualDescription,null);assert.equal(malformed.evidenceStatus,'partial_source')
reset();creative.current.source={inspirationCreativeId:sourceId,sourceRevision:'revision-1',libraryDigest:sourceDigest}
assert.equal((await (await get()).json()).evidenceStatus,'full_source')
creative.current.source.inspirationCreativeId='cre_ins_other'
assert.equal((await get()).status,404)
reset();creative.current={id:'idea'};creative.source={creativeId:sourceId,snapshot:{inspirationCreativeId:sourceId,sourceRevision:'revision-1',libraryDigest:sourceDigest}}
source.sourceRevision='changed';assert.equal((await get()).status,409,'stored canonical source remains pinned')
const previousFetch=globalThis.fetch
reset();source.originalVideoUrl='https://media.example/video.mp4?X-Amz-Signature=secret&X-Amz-Credential=secret'
assert.equal((await (await get()).json()).originalVideoUrl,'/api/brands/brand/content-creatives/idea/source/media')
for(const unsafe of ['https://public.example/admin/private','https://public.example/%61dmin/private','https://public.example/internal/video','https://public.example/a#token','https://public.example/a#','https://public.example/a?token=secret','https://public.example/a?signature=secret','https://public.example/a?X-Amz-Credential=secret','https://127.0.0.1/a','https://service.local./a']) {
  reset();source.originalPostUrl=unsafe;source.thumbnailUrl=unsafe
  const result=await (await get()).json();assert.equal(result.originalPostUrl,null);assert.equal(result.thumbnailUrl,null)
}
const previousUrl=process.env.AMC_CONTENT_SERVICE_URL,previousToken=process.env.AMC_CONTENT_SERVICE_TOKEN
try {
  process.env.AMC_CONTENT_SERVICE_URL='https://content.test'
  process.env.AMC_CONTENT_SERVICE_TOKEN='fixture-service-token'
  const client=load('src/lib/promotion-strategy/clients.ts',{'@/lib/growthPlanning':{}})
  globalThis.fetch=async(url,options)=>{
    assert.equal(String(url),'https://content.test/v1/content-library/source-evidence')
    assert.equal(options?.method,'POST')
    assert.equal(new Headers(options?.headers).get('authorization'),'Bearer fixture-service-token')
    assert.deepEqual(JSON.parse(String(options?.body)),{creativeId:sourceId})
    return Response.json({creativeId:sourceId})
  }
  assert.equal((await client.fetchCreativeSourceEvidence(sourceId)).creativeId,sourceId)
  const priorLimit=process.env.AMC_SOURCE_EVIDENCE_MAX_BYTES
  try {
    const bytes=new TextEncoder().encode(JSON.stringify({creativeId:sourceId}))
    process.env.AMC_SOURCE_EVIDENCE_MAX_BYTES=String(bytes.length)
    globalThis.fetch=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length)}})
    assert.equal((await client.fetchCreativeSourceEvidence(sourceId)).creativeId,sourceId)
    globalThis.fetch=async()=>new Response(bytes,{headers:{'content-length':String(bytes.length+1)}})
    await assert.rejects(client.fetchCreativeSourceEvidence(sourceId),/library_evidence_too_large/)
    const chunked=(extra=false)=>new Response(new ReadableStream({start(controller){controller.enqueue(bytes.slice(0,5));controller.enqueue(bytes.slice(5));if(extra)controller.enqueue(new Uint8Array([32]));controller.close()}}))
    globalThis.fetch=async()=>chunked()
    assert.equal((await client.fetchCreativeSourceEvidence(sourceId)).creativeId,sourceId)
    globalThis.fetch=async()=>chunked(true)
    await assert.rejects(client.fetchCreativeSourceEvidence(sourceId),/library_evidence_too_large/)
    globalThis.fetch=async()=>new Response(new Uint8Array(bytes.length+1),{headers:{'content-length':'1'}})
    await assert.rejects(client.fetchCreativeSourceEvidence(sourceId),/library_evidence_too_large/)
    globalThis.fetch=async()=>Response.json({error:'library_evidence_too_large'},{status:413})
    await assert.rejects(client.fetchCreativeSourceEvidence(sourceId),/library_evidence_too_large/)
  } finally {if(priorLimit===undefined)delete process.env.AMC_SOURCE_EVIDENCE_MAX_BYTES;else process.env.AMC_SOURCE_EVIDENCE_MAX_BYTES=priorLimit}
  globalThis.fetch=async()=>Response.json({error:'not found'},{status:404})
  await assert.rejects(client.fetchCreativeSourceEvidence(sourceId),/original_evidence_not_found/)
} finally {
  globalThis.fetch=previousFetch
  if(previousUrl===undefined) delete process.env.AMC_CONTENT_SERVICE_URL;else process.env.AMC_CONTENT_SERVICE_URL=previousUrl
  if(previousToken===undefined) delete process.env.AMC_CONTENT_SERVICE_TOKEN;else process.env.AMC_CONTENT_SERVICE_TOKEN=previousToken
}
console.log('PASS: source route authorization, fixed revision/digest, unresolved identity, legacy/partial/unavailable labels, safe projection and merchant deep link')
