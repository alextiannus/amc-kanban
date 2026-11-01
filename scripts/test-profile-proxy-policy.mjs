import {build} from 'esbuild'
import {createRequire} from 'node:module'
import {writeFileSync,unlinkSync} from 'node:fs'
import assert from 'node:assert/strict'
const require=createRequire(import.meta.url),file=new URL(`.profile-proxy-${process.pid}.cjs`,import.meta.url)
const state=globalThis.__profilePolicyFixture={principal:true,allowed:true,auth:0,grant:0,model:0}
const result=await build({stdin:{contents:"export {default as proxy} from './src/proxy'",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'cjs',write:false,external:['next/server','jose'],plugins:[{name:'policy-fixture',setup(b){
 b.onResolve({filter:/\/lib\/(global-text\/policy|auth-v2\/authenticate|role-permissions\/(store|routes))$/},a=>({path:a.path,namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path.endsWith('/policy')?"export async function currentBinding(){globalThis.__profilePolicyFixture.model++;throw Error('model registry unavailable')} export function signBinding(){return 'unused'}":a.path.endsWith('/authenticate')?"export async function authenticateRequest(){const s=globalThis.__profilePolicyFixture;s.auth++;return s.principal?{userId:'test'}:null}":a.path.endsWith('/store')?"export async function allows(){const s=globalThis.__profilePolicyFixture;s.grant++;return s.allowed}":"export function kanbanRoutePermission(){return 'brand.read'}"}))
}}]})
try{
 writeFileSync(file,result.outputFiles[0].contents);const {proxy}=require(file.pathname),{NextRequest}=require('next/server')
 const call=(path,method='GET')=>proxy(new NextRequest('https://amc.test'+path,{method}))
 assert.equal((await call('/api/brands/test/profile-overview')).status,200);assert.equal(state.model,0);assert.equal(state.auth,1);assert.equal(state.grant,1)
 state.principal=false;assert.equal((await call('/api/brands/test/profile-overview')).status,401);state.principal=true
 state.allowed=false;assert.equal((await call('/api/brands/test/profile-overview')).status,403);state.allowed=true
 assert.equal((await call('/api/brands/test/profile-overview','POST')).status,503)
 assert.equal((await call('/api/brands/test/profile-document')).status,503)
 assert.equal(state.model,2)
 console.log('PASS: saved Profile GET survives model registry failure; auth/role denial and model binding for other paths remain enforced.')
}finally{unlinkSync(file);delete globalThis.__profilePolicyFixture}
