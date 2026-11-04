import assert from 'node:assert/strict'
import {validateCoverage} from '../src/lib/asset-library/shoot-coordinator-contract'
const base={requestId:'R',requestVersion:2,mediaType:'video',sku:'炖鹅',scene:'厨房',requirement:'画面：揭开锅盖\n运镜：固定',id:'a'}
const shots=[base,{...base,id:'b',requirement:'画面：蒸汽散去露出鹅肉\n运镜：固定'}]
const group={mode:'sequence',instruction:'机位固定，开拍后揭盖，蒸汽散开露出肉后停机',cuts:[{n:0,use:'揭盖到蒸汽升起'},{n:1,use:'蒸汽散开后'}]}
assert.deepEqual(validateCoverage({groups:[group]},shots)[0].cuts.map(c=>c.id),['a','b'])
for(const patch of [{scene:'门口'},{mediaType:'image'},{sku:'炖鱼'},{requirement:'画面：鹅肉\n运镜：推近'}])assert.throws(()=>validateCoverage({groups:[group]},[base,{...shots[1],...patch}]))
for(const cuts of [[group.cuts[0]],[group.cuts[0],group.cuts[0]],[...group.cuts,{n:2,use:'其他'}]])assert.throws(()=>validateCoverage({groups:[{...group,cuts}]},shots))
console.log('PASS coverage, incompatible scene/motion/media/product, duplicates and invented source rejection')

// Run the service with a model fixture; read the actual packaged runtime Skill.
const {readFileSync}=await import('node:fs')
const ts=(await import('typescript')).default
const {createRequire}=await import('node:module'),require=createRequire(import.meta.url)
let writable=true,failCache=false,allowed=true,mode='ok',calls=0
const cache=new Map<string,any>()
const versions=[{id:'R',version:2,output:{items:[...shots,{...base,id:'done',done:true,requirement:'SECRET_DONE'}]}}]
const deps:any={
 '../ai-native/brainstorm':{authorizeBrainstorm:async(_:string,__:string,write:boolean)=>{if(!allowed||write&&!writable)throw Error('denied')}},
 '../ai-native/contract':{digest:JSON.stringify,nativeError:(msg:string)=>Error(msg)},
 '../prisma':{prisma:{brandMarketingSolution:{findUnique:async({where}:any)=>cache.get(where.id),upsert:async({create}:any)=>{if(failCache)throw Error('store unavailable');cache.set(create.id,create)},findMany:async({where}:any)=>{assert.equal(where.brandId,'brand');assert.deepEqual(where.id.in,['R']);assert.equal(where.period,'2026-11');return versions}}}},
 './shoot-coordinator-contract':{validateCoverage},
 '../llmRouter':{callLLM:async(_:string,prompt:string)=>{calls++;assert(prompt.includes('name: amc-shoot-coordinator'));assert(prompt.includes('从揭盖前开始'));assert(!prompt.includes('SECRET_DONE'));if(mode==='unavailable')throw Error('offline');return {text:JSON.stringify({groups:mode==='ok'?[group]:[]})}}}
}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/asset-library/shoot-coordinator.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>deps[id]||require(id),mod,mod.exports)
const run=()=>mod.exports.coordinateShoot('user','brand',{month:'2026-11',ids:['R'],language:'zh'})
const [a,b]=await Promise.all([run(),run()]);assert.equal(a.skill,'amc-shoot-coordinator');assert.deepEqual(a,b);assert.equal(calls,1)
writable=false;versions[0].version++;const again=await run();assert.equal(calls,1);assert.equal(again.groups[0].cuts[0].version,3)
versions[0].output.items[0]={...versions[0].output.items[0],requirement:'更改画面\n运镜：固定'}
assert.equal((await run()).mode,'rules');assert.equal(calls,1);writable=true
mode='invalid';assert.equal((await run()).mode,'rules')
mode='unavailable';assert.equal((await run()).mode,'rules')
failCache=true;mode='ok';assert.equal((await run()).mode,'coordinated');assert.equal(calls,4)
allowed=false;await assert.rejects(run,/denied/);assert.equal(calls,4)
console.log('PASS real Skill file dispatched only on generation; selected pending inputs, one concurrent model call, incomplete/provider failure fallbacks and authorization')
const scheduled:Array<()=>Promise<void>>=[],runs:any[]=[]
let saved:any={month:'2026-11',count:2,requestId:'R'}
const routeDeps:any={'next/server':{after:(work:()=>Promise<void>)=>scheduled.push(work)},'@/lib/asset-library/shoot-coordinator':{coordinateShoot:async(...args:any[])=>{runs.push(args);return {mode:'coordinated'}}},'@/lib/ai-native/http':{nativeHttp:async(r:any,fn:any)=>fn('owner',r.body)},'@/lib/asset-library/monthly-shooting':{prepareMonthlyShooting:async()=>saved,updateMonthlyShooting:async()=>({ok:true}),listMonthlyShooting:async()=>({months:[]})}}
const route={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/app/api/brands/[id]/shooting-plan/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>routeDeps[id],route,route.exports)
const ctx={params:Promise.resolve({id:'brand'})}
const submit=(action:string)=>route.exports.POST({body:{action,language:'en'}},ctx)
assert.deepEqual(await submit('prepare'),saved);assert.equal(runs.length,0);assert.equal(scheduled.length,1)
await scheduled.shift()!();assert.deepEqual(runs[0],['owner','brand',{month:'2026-11',ids:['R'],language:'en'}])
saved={month:null,count:0};await submit('prepare');await submit('check');await route.exports.GET({},ctx);assert.equal(scheduled.length,0);assert.equal(runs.length,1)
await submit('coordinate');assert.equal(runs.length,2)
console.log('PASS save first, post-response coordination, no model for zero needs/check/read, explicit library coordination')
