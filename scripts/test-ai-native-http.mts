import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
let auth:any=null,origin=true,calls=0
const deps:any={'../user-management/auth':{resolveSessionOrApiKey:async()=>auth},'../role-permissions/request-origin':{allowedRoleWriteOrigin:()=>origin}}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/ai-native/http.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((name:string)=>{assert(name in deps);return deps[name]},mod,mod.exports)
const run=async(userId:string,body:any)=>{calls++;assert.equal(userId,'trusted');assert.notEqual(userId,body.userId);return {ok:true}}
const request=(body='{}',headers:Record<string,string>={})=>new Request('https://amc-kanban.immedi.ai/api/brands/brand/ai/tasks',{method:'POST',body,headers})
assert.equal((await mod.exports.nativeHttp(request(),run)).status,401);assert.equal(calls,0)
auth={user:{id:'trusted',type:'HUMAN'}};origin=false
assert.equal((await mod.exports.nativeHttp(request(),run)).status,403);origin=true
assert.equal((await mod.exports.nativeHttp(request('{}',{'sec-fetch-site':'cross-site'}),run)).status,403)
assert.equal((await mod.exports.nativeHttp(request('broken'),run)).status,400)
assert.equal((await mod.exports.nativeHttp(request('x'.repeat(20001)),run)).status,413)
const result=await mod.exports.nativeHttp(request('{"userId":"forged"}'),run)
assert.equal(result.status,202);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal(calls,1)
const failed=await mod.exports.nativeHttp(request(),async()=>{throw Object.assign(new Error('private provider detail'),{code:'usage_reconciliation_required',statusCode:409})})
assert.equal(failed.status,409);assert.deepEqual(await failed.json(),{error:'usage_reconciliation_required'})
console.log('PASS: trusted owner, cross-origin rejection, body limits, admission status, no-store and redacted errors')
