import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

process.env.MODEL_CONFIG_ENCRYPTION_KEY='ab'.repeat(32)
process.env.AMC_CONTENT_SERVICE_URL='https://content.fixture'
process.env.CONTENT_SERVICE_INTERNAL_TOKEN='fixture-internal'
const pg=new PGlite()
for(const name of ['20260916090000_unified_models','20260916180000_model_management_draft'])await pg.exec(readFileSync(new URL(`../prisma/migrations/${name}/migration.sql`,import.meta.url),'utf8'))
const query=async(sql:string,...args:any[])=>(await pg.query(sql,args)).rows
const legacy=[
  {id:'text',provider:'kopix',modelName:'glm-5.3',displayName:'Kopix',apiKey:' shared-fixture ',baseUrl:'https://provider.fixture/v1',isEnabled:true,capabilities:['text_input','structured_json'],taskTags:['copywriting']},
  {id:'disabled',provider:'kopix',modelName:'old-model',displayName:'Disabled',apiKey:'shared-fixture',baseUrl:'https://provider.fixture/v1',isEnabled:false,capabilities:['text_input','structured_json'],taskTags:['copywriting']},
]
const db:any={$queryRawUnsafe:query,$executeRawUnsafe:async(sql:string,...args:any[])=>(await pg.query(sql,args)).affectedRows,lLMConfig:{findMany:async()=>legacy},assetAnalysisBatch:{findMany:async()=>[]},auditLog:{create:async()=>({})}}
db.$transaction=(run:any)=>pg.transaction(async tx=>run({...db,$queryRawUnsafe:async(sql:string,...args:any[])=>(await tx.query(sql,args)).rows,$executeRawUnsafe:async(sql:string,...args:any[])=>(await tx.query(sql,args)).affectedRows}))
db.$extends=()=>db
;(globalThis as any).prisma=db
const {importLegacyModels}=await import('../src/lib/model-management/migration.ts')
const {readDraft,saveDraft,saveModelVersion,publishDraft}=await import('../src/lib/model-management/draft.ts')
const {runtimeConfig,overview,configurationFingerprint}=await import('../src/lib/model-management/registry.ts')
const originalFetch=globalThis.fetch
let exportStatus=200
globalThis.fetch=async(input,init)=>{
  assert.equal(String(input),'https://content.fixture/v1/internal/models/export')
  assert.equal(new Headers(init?.headers).get('x-content-service-token'),'fixture-internal')
  if(exportStatus!==200)return new Response('<html>unavailable</html>',{status:exportStatus})
  return Response.json({protocolVersion:2,catalogIncludesDisabled:true,models:[{legacyId:'content:video',source:'content',name:'Video',modelName:'video',protocol:'kopix',baseUrl:'https://provider.fixture/v1',secret:'shared-fixture',isEnabled:true,capabilities:['video_output'],tasks:['video_generation'],definition:{}}],routes:[{task:'video_generation',capability:'video_generation',profileId:'video'}],issues:[],legacyJobIds:['historic-job'],inFlight:{}})
}
async function proof(selection:any,passed=true){const id=crypto.randomUUID();await pg.query('INSERT INTO "ModelPolicyValidation" (id,fingerprint,report) VALUES ($1,$2,$3::jsonb)',[id,configurationFingerprint(selection),JSON.stringify({passed})]);return id}
try{
  assert.equal(await readDraft(),null)
  await overview()
  assert.equal(await readDraft(),null,'page reads must not initialize')
  const first=await importLegacyModels('admin',0)
  assert.equal(first.result.complete,true)
  assert.equal((await runtimeConfig()).active,false,'initialization must not publish')
  let draft=await readDraft(),view=await overview()
  assert.equal(view.models.length,3)
  assert.equal(view.connections.length,1,'connection reused across models and systems')
  assert.ok(view.models.some((m:any)=>m.definition.isEnabled===false))
  const disabled=view.models.find((m:any)=>m.legacyId==='kanban:disabled')
  assert.ok(!JSON.stringify(draft.configuration).includes(disabled.id))
  assert.ok(!JSON.stringify(view).includes('shared-fixture'))
  assert.ok(!JSON.stringify(view).includes('encryptedSecret'))
  await importLegacyModels('admin',draft.revision)
  assert.equal((await overview()).models.length,3,'repeat initialization is idempotent')
  assert.equal((await overview()).connections.length,1)
  for(const status of [401,404]){
    exportStatus=status;draft=await readDraft()
    const report=await importLegacyModels('admin',draft.revision)
    assert.equal(report.result.complete,false)
    draft=await readDraft()
    await assert.rejects(()=>publishDraft(draft.revision,'invalid','admin'),/initialization issues/)
  }
  exportStatus=200;await importLegacyModels('admin',(await readDraft()).revision)
  draft=await readDraft()
  const cleared={...draft.configuration,exceptions:{}}
  await saveDraft(cleared,draft.revision,'admin')
  await importLegacyModels('admin',(await readDraft()).revision)
  assert.deepEqual((await readDraft()).configuration.exceptions,{},'repeat initialization preserves deliberate draft removal')
  draft=await readDraft();view=await overview()
  const originalText=view.models.find((m:any)=>m.id===draft.configuration.defaults.text)
  const stale=draft.revision
  await assert.rejects(()=>saveDraft({...draft.configuration,defaults:{...draft.configuration.defaults,text:disabled.id}},stale,'admin'),/unavailable/)
  const edit=await saveModelVersion({previousModelId:originalText.id,connectionId:originalText.connectionId,definition:{...originalText.definition,name:'Renamed'}},stale,'admin')
  draft=await readDraft()
  assert.equal(draft.configuration.defaults.text,edit.result.id)
  assert.equal((await overview()).connections.length,1,'editing model does not duplicate connection')
  assert.equal((await runtimeConfig()).active,false)
  await assert.rejects(()=>saveDraft(draft.configuration,stale,'other'),/Draft changed/)
  const attempts=await Promise.allSettled([saveDraft(draft.configuration,draft.revision,'admin1'),saveDraft(draft.configuration,draft.revision,'admin2')])
  assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1)
  draft=await readDraft()
  const failed=await proof(draft.configuration,false)
  await assert.rejects(()=>publishDraft(draft.revision,failed,'admin'),/validation required/)
  assert.equal((await runtimeConfig()).active,false)
  const success=await proof(draft.configuration)
  const publishAttempts=await Promise.allSettled([publishDraft(draft.revision,success,'admin'),publishDraft(draft.revision,success,'other')])
  assert.equal(publishAttempts.filter(r=>r.status==='fulfilled').length,1)
  const published=(publishAttempts.find(r=>r.status==='fulfilled') as PromiseFulfilledResult<any>).value
  const pinned=await runtimeConfig({jobId:'running',secrets:true})
  assert.equal(pinned.version,published.result.version)
  assert.equal((await runtimeConfig({source:'content',jobId:'historic-job'})).active,false)
  draft=await readDraft()
  const rotated=await saveModelVersion({previousModelId:edit.result.id,connection:{name:'Rotated',protocol:'kopix',baseUrl:'https://provider.fixture/v1',secret:'rotated-fixture',previousId:originalText.connectionId},definition:originalText.definition},draft.revision,'admin')
  draft=await readDraft()
  assert.equal(draft.configuration.defaults.text,rotated.result.id)
  assert.equal((await runtimeConfig()).version,pinned.version,'rotation only changes draft')
  await publishDraft(draft.revision,await proof(draft.configuration),'admin')
  assert.ok(Object.values((await runtimeConfig({jobId:'running',secrets:true})).secrets!).includes('shared-fixture'))
  assert.ok(Object.values((await runtimeConfig({secrets:true})).secrets!).includes('rotated-fixture'))
  const oldSelection=pinned.selection!
  await saveDraft(oldSelection,(await readDraft()).revision,'admin')
  draft=await readDraft()
  await publishDraft(draft.revision,await proof(draft.configuration),'admin')
  assert.equal((await runtimeConfig()).selection!.defaults.text,edit.result.id)
  await assert.rejects(()=>importLegacyModels('admin',(draft.revision+1)),/before unified publication/)
  console.log('PASS: read-only overview, full import, disabled models, deduplication, saved drafts, failed export, CAS, immutable edits, rotation, publication and rollback')
}finally{globalThis.fetch=originalFetch;await pg.close()}
