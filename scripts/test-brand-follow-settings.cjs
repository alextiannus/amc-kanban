const assert=require('node:assert/strict'), vm=require('node:vm'), fs=require('node:fs')
const path=require('node:path'), os=require('node:os'), {execFileSync}=require('node:child_process')
const repoRoot=path.resolve(__dirname,'..')
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'amc-follow-settings-'))
const compiled=path.join(temporary,'settings.cjs')
execFileSync(path.join(repoRoot,'node_modules/.bin/esbuild'),[path.join(repoRoot,'src/app/api/brands/[id]/settings/route.ts'),'--platform=node','--format=cjs',`--outfile=${compiled}`],{stdio:'pipe'})

let authorized=true, loggedIn=true, writes=0, saved, sideEffects=0
const brand={id:'b',followRewardDescription:'old'}
const prisma={brand:{findUnique:async()=>brand,update:async args=>{writes++;saved=args.data;return args.data}},$transaction:async()=>{sideEffects++;throw Error('Must not invoke integration side effects')}}
const deps={
 'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})},after:()=>{sideEffects++}},
 '@/lib/auth':{getSession:async()=>loggedIn?{user:{id:'owner'}}:null},'@/lib/prisma':{prisma},'@/lib/brandAccess':{canOwnBrand:async()=>authorized},
}
const mod={exports:{}}
vm.runInNewContext(fs.readFileSync(compiled,'utf8'),{module:mod,exports:mod.exports,require:name=>deps[name]||{},console})
async function patch(value){return mod.exports.PATCH({json:async()=>({followRewardDescription:value})},{params:Promise.resolve({id:'b'})})}
;(async()=>{
 let result=await patch('  关注后可领取礼物\n请向店员出示  ')
 assert.equal(result.status,200);assert.equal(saved.followRewardDescription,'关注后可领取礼物\n请向店员出示')
 result=await patch(' \n ');assert.equal(result.status,200);assert.equal(saved.followRewardDescription,null)
 for(const invalid of [null,42,{},'x'.repeat(501)]){const before=writes;result=await patch(invalid);assert.equal(result.status,400);assert.equal(writes,before)}
 result=await patch('x'.repeat(500));assert.equal(result.status,200)
 authorized=false;const before=writes;result=await patch('foreign');assert.equal(result.status,404);assert.equal(writes,before)
 loggedIn=false;result=await patch('anonymous');assert.equal(result.status,401);assert.equal(writes,before)
 assert.equal(sideEffects,0)
 console.log('Settings API passed: save, trim, line breaks, clear, 500-char bound, type validation, authorization, and no integration side effects.')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>fs.rmSync(temporary,{recursive:true,force:true}))
