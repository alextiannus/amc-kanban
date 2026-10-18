import assert from 'node:assert/strict';import ts from 'typescript';import {readFileSync} from 'node:fs';
let authenticated=true,write=false,origin=true,reads=0,writes=0;
const module={exports:{} as any},code=ts.transpileModule(readFileSync('src/app/api/brands/[id]/insight/sources/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','module','exports',code)((name:string)=>{
 if(name==='next/server')return {NextResponse:{json:Response.json}};
 if(name.includes('request-origin'))return {allowedRoleWriteOrigin:()=>origin};
 if(name.includes('user-management/auth'))return {resolveSessionOrApiKey:async()=>authenticated?{user:{id:'owner',type:'HUMAN',role:'USER'}}:null};
 if(name.includes('brandAccess'))return {canSessionWriteBrandProject:async()=>write,canSessionAccessBrandProject:async()=>true};
 if(name.includes('insight-sources'))return {readInsightSources:async(id:string)=>{assert.equal(id,'brand');reads++;return {sources:[],revision:'a'.repeat(64)}},saveInsightSources:async(id:string,user:string,body:any)=>{assert.equal(id,'brand');assert.equal(user,'owner');assert.equal(body.expectedRevision,'a'.repeat(64));writes++;return {sources:[],revision:'b'.repeat(64)}}};
 throw Error(name);
},module,module.exports);
const context={params:Promise.resolve({id:'brand'})},get=()=>module.exports.GET(new Request('https://mm.test/api/brands/brand/insight/sources'),context),put=(body:any={expectedRevision:'a'.repeat(64),sources:[]})=>module.exports.PUT(new Request('https://mm.test/api/brands/brand/insight/sources',{method:'PUT',body:typeof body==='string'?body:JSON.stringify(body)}),context);
authenticated=false;assert.equal((await get()).status,401);assert.equal(reads,0);authenticated=true;
let r=await get();assert.equal(r.status,200);assert.equal((await r.json()).canEdit,false);assert.equal((await put()).status,404);assert.equal(writes,0);
write=true;origin=false;assert.equal((await put()).status,403);origin=true;assert.equal((await put('{')).status,400);assert.equal((await put('x'.repeat(1000001))).status,413);
r=await put();assert.equal(r.status,200);assert.equal(writes,1);assert.equal(r.headers.get('cache-control'),'no-store');
console.log('PASS: authenticated brand scope, read/write separation, CSRF, body limits, malformed JSON and server-owned actor');
