import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
const dir=await mkdtemp(tmpdir()+'/video-proxy-')
try{
 await build({entryPoints:['src/app/api/video-editor/[operation]/route.ts'],bundle:true,platform:'node',format:'esm',outfile:dir+'/route.mjs',plugins:[{name:'deps',setup(b){b.onResolve({filter:/^(next\/headers|@\/lib\/auth-v2|@\/lib\/role-permissions\/(store|request-origin))$/},a=>({path:a.path,namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:a.path.includes('headers')?`export const cookies=async()=>({get:()=>({value:'test-session'})})`:a.path.includes('auth-v2')?`export const authenticateCurrentSession=async()=>globalThis.actor`:a.path.includes('request-origin')?`export const allowedRoleWriteOrigin=r=>r.headers.get('origin')==='https://amc-kanban.immedi.ai'`:`export const allows=async()=>globalThis.permission`}))}}]})
 const route=await import(dir+'/route.mjs');globalThis.actor={userId:'test'};globalThis.permission=true;const calls=[];globalThis.fetch=async(url,options)=>{calls.push({url,options});return Response.json({job:{id:'one'}})}
 const invoke=(method,operation,origin='https://amc-kanban.immedi.ai')=>route[method](new Request(`http://internal/api/video-editor/${operation}?id=one`,{method,headers:origin?{origin}:{},...(method==='GET'?{}:{body:JSON.stringify({action:'cancel_job',id:'one'})})}),{params:Promise.resolve({operation})})
 assert.equal((await invoke('PATCH','jobs')).status,200);assert.equal(calls[0].url,'https://amc-mm.immedi.ai/api/content/video-jobs?id=one');assert.equal(calls[0].options.redirect,'error');assert.equal(calls[0].options.headers.cookie,'session=test-session');assert(!calls[0].options.headers.authorization)
 for(const origin of ['https://evil.test',''])assert.equal((await invoke('POST','jobs',origin)).status,403)
 assert.equal((await invoke('POST','presets')).status,404);assert.equal((await invoke('GET','arbitrary')).status,404)
 globalThis.permission=false;assert.equal((await invoke('GET','jobs')).status,403);globalThis.actor=null;assert.equal((await invoke('GET','jobs')).status,401);assert.equal(calls.length,1)
 console.log('PASS native BFF: fixed upstream, no redirects, session-only forwarding, origin/permission/auth gates')
}finally{await rm(dir,{recursive:true,force:true})}
