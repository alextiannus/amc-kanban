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
let allowed=true,mode='ok',calls=0
const versions=[{id:'R',version:2,output:{items:[...shots,{...base,id:'done',done:true,requirement:'SECRET_DONE'}]}}]
const deps:any={
 '../ai-native/brainstorm':{authorizeBrainstorm:async()=>{if(!allowed)throw Error('denied')}},
 '../ai-native/contract':{digest:JSON.stringify,nativeError:(msg:string)=>Error(msg)},
 '../prisma':{prisma:{brandMarketingSolution:{findMany:async({where}:any)=>{assert.equal(where.brandId,'brand');assert.deepEqual(where.id.in,['R']);assert.equal(where.period,'2026-11');return versions}}}},
 './shoot-coordinator-contract':{validateCoverage},
 '../llmRouter':{callLLM:async(_:string,prompt:string)=>{calls++;assert(prompt.includes('name: amc-shoot-coordinator'));assert(prompt.includes('从揭盖前开始'));assert(!prompt.includes('SECRET_DONE'));if(mode==='unavailable')throw Error('offline');return {text:JSON.stringify({groups:mode==='ok'?[group]:[]})}}}
}
const mod={exports:{} as any}
new Function('require','module','exports',ts.transpileModule(readFileSync('src/lib/asset-library/shoot-coordinator.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)((id:string)=>deps[id]||require(id),mod,mod.exports)
const run=()=>mod.exports.coordinateShoot('user','brand',{month:'2026-11',ids:['R'],language:'zh'})
const [a,b]=await Promise.all([run(),run()]);assert.equal(a.skill,'amc-shoot-coordinator');assert.deepEqual(a,b);assert.equal(calls,1)
mode='invalid';assert.equal((await run()).mode,'rules')
mode='unavailable';assert.equal((await run()).mode,'rules')
allowed=false;await assert.rejects(run,/denied/);assert.equal(calls,3)
console.log('PASS real Skill file dispatched only on generation; selected pending inputs, one concurrent model call, incomplete/provider failure fallbacks and authorization')
