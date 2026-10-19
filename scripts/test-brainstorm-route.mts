import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {nativeError} from '../src/lib/ai-native/contract.ts'
let auth:any=null,origin=true,calls:any[]=[]
const load=(file:string,deps:any)=>{const mod={exports:{} as any};new Function('require','module','exports',ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports);return mod.exports}
const http=load('src/lib/ai-native/http.ts',{'../user-management/auth':{resolveSessionOrApiKey:async()=>auth},'../role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin}})
const service=Object.fromEntries(['listBrainstorm','refreshBrainstorm','decideBrainstorm','replicateBrainstorm','dismissCalendarCreative','decideSavedBrainstorm'].map(name=>[name,async(userId:string,brandId:string,body:any)=>{calls.push({name,userId,brandId,body});assert.equal(userId,'actual-user');assert.equal(brandId,'brand');return {ok:true}}]))
const route=load('src/app/api/brands/[id]/ai/brainstorm/route.ts',{'@/lib/ai-native/http':http,'@/lib/ai-native/brainstorm':service,'@/lib/ai-native/contract':{nativeError}})
const ctx={params:Promise.resolve({id:'brand'})},url='https://kanban.example/api/brands/brand/ai/brainstorm'
const post=(body:any)=>new Request(url,{method:'POST',headers:{origin:'https://kanban.example'},body:JSON.stringify(body)})
assert.equal((await route.GET(new Request(url),ctx)).status,401);assert.equal((await route.POST(post({action:'decide'}),ctx)).status,401)
auth={user:{id:'actual-user',type:'AI'}};assert.equal((await route.GET(new Request(url),ctx)).status,403)
auth.user.type='HUMAN';origin=false;assert.equal((await route.POST(post({action:'replicate'}),ctx)).status,403);assert.equal(calls.length,0);origin=true
const result=await route.GET(new Request(url),ctx);assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store')
for(const action of ['refresh','decide','replicate','dismiss','decideSaved'])assert.equal((await route.POST(post({action}),ctx)).status,202)
for(const body of [null,[],{action:'unknown'}])assert.equal((await route.POST(post(body),ctx)).status,400)
assert.equal((await route.POST(new Request(url,{method:'POST',headers:{'sec-fetch-site':'cross-site'},body:'{}'}),ctx)).status,403)
assert.deepEqual(calls.map(c=>c.name),['listBrainstorm','refreshBrainstorm','decideBrainstorm','replicateBrainstorm','dismissCalendarCreative','decideSavedBrainstorm'])
console.log('PASS: authenticated human owner, trusted session identity, Origin/cross-site guards, no-store, action routing and invalid request rejection')
