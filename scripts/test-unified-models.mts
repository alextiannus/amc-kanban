import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { encryptSecret, decryptSecret } from '../src/lib/model-management/secrets.ts'
import { selectModel } from '../src/lib/model-management/types.ts'

process.env.MODEL_CONFIG_ENCRYPTION_KEY='ab'.repeat(32)
const encrypted=encryptSecret('fixture-key')
assert.equal(decryptSecret(encrypted),'fixture-key')
assert.notEqual(encrypted,encryptSecret('fixture-key'))
assert.throws(()=>decryptSecret(encrypted.replace(/^v1\./,'v2.')))
process.env.MODEL_CONFIG_ENCRYPTION_KEY='cd'.repeat(32)
assert.throws(()=>decryptSecret(encrypted))
process.env.MODEL_CONFIG_ENCRYPTION_KEY='ab'.repeat(32)

const pg=new PGlite()
await pg.exec(readFileSync(new URL('../prisma/migrations/20260916090000_unified_models/migration.sql',import.meta.url),'utf8'))
await pg.exec(readFileSync(new URL('../prisma/migrations/20260916180000_model_management_draft/migration.sql',import.meta.url),'utf8'))
const query=async(sql:string,...values:any[]) => (await pg.query(sql,values)).rows
const exec=async(sql:string,...values:any[]) => (await pg.query(sql,values)).affectedRows
const db:any={$queryRawUnsafe:query,$executeRawUnsafe:exec,auditLog:{create:async()=>({})}}
db.$transaction=(run:any)=>pg.transaction(async tx=>run({...db,$queryRawUnsafe:async(sql:string,...values:any[])=>(await tx.query(sql,values)).rows,$executeRawUnsafe:async(sql:string,...values:any[])=>(await tx.query(sql,values)).affectedRows}))
db.$extends=()=>db
;(globalThis as any).prisma=db
const {createConnection,createModel,runtimeConfig,publish,configurationFingerprint,rejectLegacyModelWrite,overview,validateConnection}=await import('../src/lib/model-management/registry.ts')
const priorNodeEnv=process.env.NODE_ENV
try{
 ;(process.env as any).NODE_ENV='production'
 const gateway={name:'Existing gateway',protocol:'cn_gateway',baseUrl:'http://gateway.fixture:8080',secret:'fixture-key'}
 assert.doesNotThrow(()=>validateConnection(gateway))
 for(const protocol of ['openai','kopix','custom_shim','minimax'])assert.throws(()=>validateConnection({...gateway,protocol}),/HTTPS/)
 assert.throws(()=>validateConnection({...gateway,baseUrl:'http://user:password@gateway.fixture'}),/Invalid provider URL/)
 assert.throws(()=>validateConnection({...gateway,baseUrl:'file:///gateway'}),/Invalid provider URL/)
}finally{if(priorNodeEnv===undefined)delete (process.env as any).NODE_ENV;else (process.env as any).NODE_ENV=priorNodeEnv}
async function validation(selection:any){const id=crypto.randomUUID();await exec('INSERT INTO "ModelPolicyValidation" (id,fingerprint,report) VALUES ($1,$2,$3::jsonb)',id,configurationFingerprint(selection),JSON.stringify({passed:true}));return id}
try{
 assert.equal((await runtimeConfig()).active,false)
 const oldJob=await runtimeConfig({jobId:'before-cutover'});assert.equal(oldJob.version,null)
 const c1=await createConnection({name:'Supplier A',protocol:'openai',baseUrl:'https://a.example/v1',secret:'fixture-key'},'admin')
 const text={name:'Text',modelName:'glm-5.3',capabilities:['text'],inputCapabilities:['text_input','structured_json'],timeoutMs:1000,maxRetries:0} as any
 const m1=await createModel({connectionId:c1.id,definition:text},'admin')
 const image=await createModel({connectionId:c1.id,definition:{...text,name:'Vision',modelName:'vision',capabilities:['image_understanding'],inputCapabilities:['image_input','structured_json']}},'admin')
 const selection={defaults:{text:m1.id,image_understanding:image.id},exceptions:{'content:asset_image_analysis':image.id}}
 const first=await publish(selection,null,await validation(selection),'admin')
 const pinned=await runtimeConfig({jobId:'running',secrets:true})
 assert.equal(selectModel(pinned,'mm','arbitrary-legacy-task','text').id,m1.id)
 assert.equal(selectModel(pinned,'content','asset_image_analysis','image_understanding').id,image.id)
 assert.throws(()=>selectModel(pinned,'content','video_generation','video_generation'))
 assert.throws(()=>selectModel(pinned,'content','asset_image_analysis','image_understanding',['video_input']))
 await assert.rejects(()=>rejectLegacyModelWrite(),/MOVED/)
 assert.equal((await runtimeConfig({jobId:'before-cutover'})).active,false)
 assert.equal((await query('SELECT COUNT(*)::int AS n FROM "ModelConnection"'))[0].n,1,'models share connection')
 const c2=await createConnection({name:'Supplier A rotated',protocol:'openai',baseUrl:'https://a.example/v1',secret:'rotated-key',previousId:c1.id},'admin')
 const m2=await createModel({connectionId:c2.id,definition:{...text,modelName:'new-model'}},'admin')
 const next={...selection,defaults:{...selection.defaults,text:m2.id}},proof=await validation(next)
 const concurrent=await Promise.allSettled([publish(next,first.version,proof,'admin1'),publish(next,first.version,proof,'admin2')])
 assert.equal(concurrent.filter(r=>r.status==='fulfilled').length,1)
 const latest=await runtimeConfig({secrets:true})
 assert.equal(selectModel(latest,'kanban','text','text').id,m2.id)
 const running=await runtimeConfig({jobId:'running',secrets:true})
 assert.equal(running.version,first.version)
 assert.equal(Object.values(running.secrets!).includes('fixture-key'),true)
 assert.equal(Object.values(latest.secrets!).includes('rotated-key'),true)
 assert.ok(!JSON.stringify(await overview()).includes('fixture-key'))
 assert.ok(!JSON.stringify(await overview()).includes('encryptedSecret'))
 await assert.rejects(()=>exec('UPDATE "ModelConnection" SET name=$1 WHERE id=$2','tampered',c1.id),/immutable/)
 await assert.rejects(()=>publish(selection,latest.version,proof,'admin'),/validation required/)
 const rollback=await publish(selection,latest.version,await validation(selection),'admin')
 assert.ok(rollback.version>latest.version!)
 assert.equal(selectModel(await runtimeConfig(),'mm','text','text').id,m1.id)
 await assert.rejects(()=>runtimeConfig({version:999999}),/unavailable/)
 console.log('PASS: migration, encrypted shared connections, rotation, capability checks, CAS publication, rollback and pinned jobs')
}finally{await pg.close()}
