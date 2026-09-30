import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import { CreativeRevisionError } from '../src/lib/brand-plan/creativeRevisionContract.ts'
let auth:any=null,origin=true,calls=0,fail=false
const deps:any={
 '@/lib/user-management/auth':{resolveSessionOrApiKey:async()=>auth},
 '@/lib/role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin},
 '@/lib/brand-plan/creativeRevisions':{CreativeRevisionError,
  readCreativeRevisions:async(actor:any,brand:string,month:string,id:string,revision:string)=>{calls++;assert.equal(actor.id,'trusted-user');assert.equal(brand,'brand');assert.equal(id,'idea');assert.equal(month,'2026-11');assert.equal(revision,'version-1');return{ok:true}},
  saveCreativeRevision:async(actor:any)=>{calls++;assert.equal(actor.id,'trusted-user');if(fail)throw new CreativeRevisionError('creative_revision_conflict',409);return{ok:true}},
 },
}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/app/api/brands/[id]/content-creatives/[creativeId]/revisions/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((key:string)=>{assert(key in deps);return deps[key]},mod,mod.exports)
const ctx={params:Promise.resolve({id:'brand',creativeId:'idea'})}
const request=(body='{}')=>new Request('http://localhost/api/brands/brand/content-creatives/idea/revisions?month=2026-11&revisionId=version-1',{method:'POST',body})
assert.equal((await mod.exports.GET(request(),ctx)).status,401)
assert.equal((await mod.exports.POST(request(),ctx)).status,401);assert.equal(calls,0)
auth={user:{id:'trusted-user',type:'HUMAN'}};origin=false
assert.equal((await mod.exports.POST(request(),ctx)).status,403);assert.equal(calls,0)
origin=true
assert.equal((await mod.exports.POST(request('not-json'),ctx)).status,400)
assert.equal((await mod.exports.POST(request('a'.repeat(100001)),ctx)).status,413)
const read=await mod.exports.GET(request(),ctx);assert.equal(read.status,200);assert.equal(read.headers.get('cache-control'),'no-store')
assert.equal((await mod.exports.POST(request(JSON.stringify({actorId:'forged'})),ctx)).status,200)
fail=true;assert.equal((await mod.exports.POST(request(),ctx)).status,409)
console.log('PASS: revision route authentication, origin, trusted actor, limits, explicit historical read, no-store and conflict response')
