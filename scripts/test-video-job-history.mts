import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const compile=(file:string,deps:Record<string,unknown>)=>{
 const mod={exports:{} as any}
 const output=ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText
 new Function('require','module','exports',output)((key:string)=>{assert(key in deps,key);return deps[key]},mod,mod.exports)
 return mod.exports
}
const date=new Date('2026-10-29T01:00:00Z')
const rows=Array.from({length:23},(_,i)=>({id:`job-${String(99-i).padStart(3,'0')}`,brandId:'brand',createdBy:'actor',title:`Video ${i}`,platform:'tiktok',status:i===0?'completed':'generating',progress:40,thumbnailUrl:null,finalVideoUrl:i===0?'/final.mp4':null,createdAt:date,updatedAt:date,plan:{_mmVideoJob:{language:'zh',generationStage:'video_generation',videoReceipt:{secret:'never-return'}}}}))
rows.push({...rows[0],id:'foreign-owner',createdBy:'other'},{...rows[0],id:'foreign-brand',brandId:'other'},{...rows[0],id:'legacy-owner',createdBy:null as any})
let active=true,allowed=true,reads=0,saves=0
const calls:any[]=[]
const matches=(row:any,where:any)=>row.brandId===where.brandId&&row.createdBy===where.createdBy&&(!where.status||where.status.in.includes(row.status))&&(!where.OR||row.createdAt<where.OR[0].createdAt.lt||(+row.createdAt===+where.OR[1].createdAt&&row.id<where.OR[1].id.lt))
const prisma={user:{findUnique:async()=>active?{id:'actor',status:'ACTIVE',type:'HUMAN',role:'USER'}:null},videoProductionJob:{
 findMany:async(query:any)=>{reads++;calls.push(query);return rows.filter(row=>matches(row,query.where)).sort((a,b)=>b.createdAt.valueOf()-a.createdAt.valueOf()||b.id.localeCompare(a.id)).slice(0,query.take)},
 count:async(query:any)=>{calls.push(query);return rows.filter(row=>matches(row,query.where)).length},
}}
const access=compile('src/lib/videoJobAccess.ts',{'./prisma':{prisma},'./user-management/brandAccess':{canUserAccessBrand:async()=>allowed}})
const history=compile('src/lib/videoJobHistory.ts',{'./prisma':{prisma},'./videoJobAccess':access})
const first=await history.listTrustedVideoJobs('actor','brand')
assert.equal(first.items.length,20);assert.equal(first.activeCount,22);assert(first.nextCursor)
assert.equal(first.items[0].id,'job-099');assert(!JSON.stringify(first).includes('never-return'));assert(!('createdBy' in first.items[0]));assert(!('plan' in first.items[0]))
const second=await history.listTrustedVideoJobs('actor','brand','all',first.nextCursor)
assert.equal(second.items.length,3);assert.equal(second.nextCursor,null)
assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,23,'same-timestamp pagination must not duplicate records')
const completed=await history.listTrustedVideoJobs('actor','brand','completed')
assert.equal(completed.items.length,1);assert.equal(completed.items[0].hasFinalVideo,true)
assert(calls.every(q=>q.where.createdBy==='actor'&&q.where.brandId==='brand'))
assert(calls.filter(q=>q.select).every(q=>!q.select.sceneExecutions&&!q.select.finalExecution&&!q.select.voiceoverState))
for(const [status,cursor] of [['invented',''],['all','bad-cursor'],['active','x'.repeat(801)]])await assert.rejects(history.listTrustedVideoJobs('actor','brand',status,cursor),e=>(e as any).status===400)
const before=reads;allowed=false
await assert.rejects(history.listTrustedVideoJobs('actor','brand'),e=>(e as any).status===404)
allowed=true;active=false
await assert.rejects(history.listTrustedVideoJobs('actor','brand'),e=>(e as any).status===404)
assert.equal(reads,before,'denied reads must not query job rows');active=true

const originalToken=process.env.CONTENT_SERVICE_INTERNAL_TOKEN
process.env.CONTENT_SERVICE_INTERNAL_TOKEN='test-internal-token'
try{
 const route=compile('src/app/api/internal/content/video-jobs/route.ts',{
  'node:crypto':await import('node:crypto'),'@/lib/videoJobAccess':access,'@/lib/videoJobContract':{serializeTrustedVideoJob:()=>{throw Error('list must not serialize full jobs')}},
  '@/lib/videoJobPersistence':{saveVideoJob:()=>{saves++;throw Error('list must not save')}},'@/lib/videoJobHistory':history,
 })
 const request=(body:any,token='test-internal-token')=>new Request('https://test/api/internal/content/video-jobs',{method:'POST',headers:{'x-content-service-token':token},body:JSON.stringify(body)})
 assert.equal((await route.POST(request({action:'list',actorId:'actor',brandId:'brand'},'wrong'))).status,401)
 const response=await route.POST(request({action:'list',actorId:'actor',brandId:'brand'}))
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal((await response.json()).items.length,20)
 assert.equal((await route.POST(request({action:'list',actorId:'actor'}))).status,400)
 allowed=false;assert.equal((await route.POST(request({action:'list',actorId:'actor',brandId:'brand'}))).status,404)
 assert.equal(saves,0)
}finally{if(originalToken===undefined)delete process.env.CONTENT_SERVICE_INTERNAL_TOKEN;else process.env.CONTENT_SERVICE_INTERNAL_TOKEN=originalToken}
console.log('PASS video history owner/brand permissions, disabled users, safe summaries, cursor pagination, filters and read-only authenticated route')
