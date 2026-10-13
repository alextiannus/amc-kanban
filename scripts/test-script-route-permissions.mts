import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import ts from 'typescript'
import {NextRequest,NextResponse} from 'next/server'
import {kanbanRoutePermission} from '../src/lib/role-permissions/routes.ts'
let grants=['brand.read','draft.read','draft.update'],authenticated=true
const deps:any={
 './lib/global-text/policy':{currentBinding:async()=>({}),signBinding:()=> 'test-binding'},
 'next/server':{NextResponse},'jose':{jwtVerify:async()=>({})},
 './lib/auth-v2/authenticate':{authenticateRequest:async()=>authenticated?{userId:'editor'}:null},
 './lib/role-permissions/store':{allows:async(_:unknown,key:string)=>grants.includes(key)},
 './lib/role-permissions/routes':{kanbanRoutePermission},
}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/proxy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports)
const request=(path:string,method='POST')=>new NextRequest('https://amc-kanban.immedi.ai'+path,{method,headers:{'x-client-type':'mm'}})
const paths=['/api/brands/brand/content-creatives/idea/revisions','/api/brands/brand/ai/tasks/task/adopt']
for(const path of paths){
 const allowed=await mod.exports.default(request(path))
 assert.equal(allowed.status,200);assert.equal(allowed.headers.get('x-middleware-next'),'1')
 assert.equal((await mod.exports.default(request(path,'GET'))).status,200)
}
assert.equal((await mod.exports.default(request('/api/brands/brand','PATCH'))).status,403)
grants=['brand.read','asset.read','asset.create']
for(const path of paths)assert.equal((await mod.exports.default(request(path))).status,403)
authenticated=false
assert.equal((await mod.exports.default(request(paths[0]))).status,401)
console.log('PASS: actual Kanban proxy admits scoped content editors, protects brand updates and rejects unrelated grants/anonymous calls')
