import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import path from 'node:path'
const temp=await mkdtemp(path.join(tmpdir(),'video-entry-'))
try{
 for(const route of ['dashboard/video','admin/video-production']){
  const file=path.join(temp,route.replaceAll('/','-')+'.mjs')
  await build({entryPoints:[`src/app/${route}/page.tsx`],bundle:true,platform:'node',format:'esm',outfile:file,jsx:'automatic',plugins:[{name:'entry-fixture',setup(b){
   b.onResolve({filter:/^(next\/|@\/lib\/auth-v2|@\/lib\/role-permissions\/store|react\/jsx-runtime)/},args=>({path:args.path,namespace:'fixture'}))
   b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next/navigation'?`export const redirect=url=>{throw {redirect:url}}`:args.path==='next/link'?`export default ()=>null`:args.path==='react/jsx-runtime'?`export const jsx=(tag,props)=>({tag,props});export const jsxs=jsx;`:args.path.includes('auth-v2')?`export const authenticateCurrentSession=async()=>globalThis.principal;export const canAccessBrandScope=async()=>globalThis.brandAllowed;`:`export const allows=async()=>globalThis.permissionAllowed;`,loader:'js'}))
  }}]})
  const {default:Page}=await import(file)
  globalThis.principal={id:'tester'};globalThis.brandAllowed=true;globalThis.permissionAllowed=true
  const invoke=async params=>{try{return await Page({searchParams:Promise.resolve(params)})}catch(e){return e}}
  const result=await invoke({brandId:'brand-1',assetIds:'asset-a,asset-b',returnUrl:'https://untrusted.invalid',script:'untrusted'})
  const u=new URL(result.redirect);assert.equal(u.origin,'https://amc-mm.immedi.ai');assert.equal(u.searchParams.get('videoEditor'),'1');assert.equal(u.searchParams.get('brandId'),'brand-1');assert(!u.searchParams.has('script'));assert(!u.searchParams.has('returnUrl'))
  if(route.startsWith('dashboard'))assert.equal(u.searchParams.get('assetIds'),'asset-a,asset-b')
  else{globalThis.brandAllowed=false;assert(!(await invoke({brandId:'brand-1'})).redirect);globalThis.brandAllowed=true;globalThis.permissionAllowed=false;assert(!(await invoke({brandId:'brand-1'})).redirect);globalThis.principal=null;assert.equal((await invoke({})).redirect,'/')}
  console.log('PASS',route,'canonical editor, context allowlist and applicable access checks')
 }
}finally{await rm(temp,{recursive:true,force:true})}
