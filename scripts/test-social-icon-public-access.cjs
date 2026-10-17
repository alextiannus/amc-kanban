const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{execFileSync}=require('node:child_process'),{randomUUID}=require('node:crypto')
const root=path.resolve(__dirname,'..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'amc-social-icon-proxy-')),compiled=path.join(temp,'proxy.cjs')
execFileSync(path.join(root,'node_modules/.bin/esbuild'),[path.join(root,'src/proxy.ts'),'--format=cjs','--platform=node',`--outfile=${compiled}`],{stdio:'pipe'})
const deps={
 'next/server':{NextResponse:{next:()=>({kind:'next',headers:new Headers()}),redirect:url=>({kind:'redirect',url:url.href}),json:()=>({kind:'error'})}},
 './lib/global-text/policy':{},jose:{},'./lib/auth-v2/authenticate':{},'./lib/role-permissions/store':{},'./lib/role-permissions/routes':{kanbanRoutePermission:()=>null},
}
const mod={exports:{}}
vm.runInNewContext(fs.readFileSync(compiled,'utf8'),{module:mod,exports:mod.exports,require:name=>{if(!deps[name])throw Error(name);return deps[name]},Headers,URL,crypto:{randomUUID},console})
async function check(route,method='GET'){return mod.exports.default({url:'https://test'+route,nextUrl:new URL('https://test'+route),method,headers:new Headers(),cookies:{get:()=>undefined}})}
;(async()=>{
 for(const platform of ['instagram','tiktok','xiaohongshu','facebook','youtube','linkedin','x','wechat','google'])for(const method of ['GET','HEAD'])assert.equal((await check(`/social-platforms/${platform}-original.jpg`,method)).kind,'next')
 for(const route of ['/social-platforms/unknown.jpg','/social-platforms/original-icon-sources.json','/social-platforms/instagram-original.jpg/private','/board'])assert.equal((await check(route)).kind,'redirect')
 assert.equal((await check('/social-platforms/instagram-original.jpg','POST')).kind,'redirect')
 assert.equal((await check('/game/test')).kind,'next')
 console.log('Anonymous original icon GET/HEAD passed; unknown paths, directory metadata, POST and protected pages remain gated.')
})().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}))
